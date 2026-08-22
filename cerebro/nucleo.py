"""Las cuatro funciones que P3 importa.

    extraer(raw_events)            -> list[KnowledgeItem]
    calcular_riesgo(items)         -> list[RiskScore]
    simular(scenario_id, items)    -> SimulationResult
    generar_digest(items, scores)  -> list[Quest]

Todas aceptan `mock=True` para devolver los datos falsos de `mocks.py` — es el
plan B del demo. Si no hay API key configurada, caen a mock automáticamente en
vez de reventar.
"""

from __future__ import annotations

import hashlib
from typing import Literal

from pydantic import BaseModel, Field

from . import grafo as g
from . import llm, mocks
from .esquemas import (
    ESCENARIOS_POR_ID,
    KnowledgeItem,
    Quest,
    RawEvent,
    RiskScore,
    SimulationResult,
)

LOTE = 20  # eventos por llamada: contexto manejable y evidencia rastreable

PESOS = {"acceso": 3, "proceso": 2, "tarea": 1, "regla_tacita": 2}
MULTIPLICADOR_SIN_RESPALDO = 2
BONO_INTERMEDIACION = 0.5  # la persona mas central del grafo pesa 1.5x


# --- Modelos internos de salida del LLM (ASCII puro, sin ñ ni tildes en las
# --- claves: el contrato público sí las lleva, aquí evitamos sorpresas)


class _ItemExtraido(BaseModel):
    tipo: Literal["tarea", "acceso", "regla_tacita", "proceso"]
    descripcion: str
    dueno_principal: str
    respaldos: list[str] = Field(default_factory=list)
    fuente: Literal["slack", "github", "meet", "notion"]
    evidencia: str
    evento_ids: list[str] = Field(default_factory=list)


class _LoteExtraido(BaseModel):
    items: list[_ItemExtraido]


class _Fusion(BaseModel):
    """Grupos de índices que describen el mismo conocimiento."""

    grupos: list[list[int]]


class _QuestGenerada(BaseModel):
    asignado_a: str
    accion: str
    item_relacionado: str
    puntos: int


class _Digest(BaseModel):
    quests: list[_QuestGenerada]


# --- Prompts --------------------------------------------------------------------

SISTEMA_EXTRACCION = """Eres un analista de continuidad organizacional. Tu trabajo es \
detectar qué conocimiento de una empresa vive en la cabeza de una sola persona.

Extraes cuatro tipos de elementos:
- tarea: algo que alguien hace de forma recurrente.
- acceso: una credencial, permiso o cuenta que alguien controla.
- proceso: una secuencia de pasos que alguien sabe ejecutar.
- regla_tacita: una norma o preferencia no escrita, del estilo "al jefe solo le \
gusta viajar en LATAM" o "los viernes no se despliega".

Reglas duras:
- Usa SOLO emails que aparezcan literalmente en los eventos. Nunca inventes personas.
- `respaldos` son otras personas que, según los eventos, demuestran conocer ese \
mismo elemento. Si nadie más lo demuestra, deja la lista vacía. No adivines.
- `evidencia` es una cita textual corta y literal del evento que lo sustenta.
- `descripcion` es concreta y accionable, no genérica.
- Si un evento no aporta conocimiento organizacional (saludos, chistes, ruido), \
no extraigas nada de él.
- Todo en español."""

SISTEMA_PLAYBOOK = """Eres el jefe de operaciones que debe cubrir una emergencia \
organizacional hoy. Escribes documentos de empalme en Markdown: concretos, en \
español, sin relleno corporativo y sin inventar información que no esté en la \
evidencia.

Un buen playbook responde: qué hacía la persona o el sistema afectado, cómo lo \
hacía, qué reglas no escritas hay que respetar, quién asume cada cosa y qué pasa \
en las primeras 48 horas. Las reglas tácitas son lo más valioso del documento: \
nómbralas explícitamente, son lo primero que se pierde."""

SISTEMA_DIGEST = """Generas misiones semanales de descentralización del conocimiento. \
Cada misión es una acción imperativa, concreta y ejecutable en menos de una hora, \
dirigida a la persona que hoy es el único punto de falla. En español."""


# --- 1. Extracción --------------------------------------------------------------


def _id_item(dueno: str, descripcion: str) -> str:
    return "ki-" + hashlib.sha256(f"{dueno}|{descripcion}".encode()).hexdigest()[:10]


def _formatear_eventos(eventos: list[RawEvent]) -> str:
    lineas = []
    for ev in eventos:
        participantes = ", ".join(ev.participantes) or "—"
        lineas.append(
            f"[{ev.id}] fuente={ev.fuente} tipo={ev.tipo} autor={ev.autor_email} "
            f"participantes={participantes} fecha={ev.timestamp}\n{ev.contenido}"
        )
    return "\n\n---\n\n".join(lineas)


def extraer(raw_events: list[RawEvent | dict], *, fusionar: bool = True, mock: bool = False) -> list[KnowledgeItem]:
    """RawEvent[] -> KnowledgeItem[]. Cacheado en disco por lote."""
    if mock or not llm.hay_api_key():
        return list(mocks.ITEMS)

    eventos = [e if isinstance(e, RawEvent) else RawEvent.model_validate(e) for e in raw_events]
    if not eventos:
        return []

    items: list[KnowledgeItem] = []
    for inicio in range(0, len(eventos), LOTE):
        lote = eventos[inicio : inicio + LOTE]
        prompt = (
            "Extrae los elementos de conocimiento de estos eventos:\n\n"
            + _formatear_eventos(lote)
        )
        salida = llm.parse_json(SISTEMA_EXTRACCION, prompt, _LoteExtraido)
        for it in salida.items:
            items.append(
                KnowledgeItem(
                    id=_id_item(it.dueno_principal, it.descripcion),
                    tipo=it.tipo,
                    descripcion=it.descripcion,
                    dueño_principal=it.dueno_principal,
                    respaldos=sorted(set(it.respaldos) - {it.dueno_principal}),
                    fuente=it.fuente,
                    evidencia=it.evidencia,
                    evento_ids=it.evento_ids,
                )
            )

    items = _dedup_exacto(items)
    return _fusionar(items) if fusionar and len(items) > 1 else items


def _dedup_exacto(items: list[KnowledgeItem]) -> list[KnowledgeItem]:
    """Mismo id (mismo dueño + misma descripción) = mismo item; une los respaldos."""
    por_id: dict[str, KnowledgeItem] = {}
    for it in items:
        if (previo := por_id.get(it.id)) is None:
            por_id[it.id] = it
        else:
            previo.respaldos = sorted(set(previo.respaldos) | set(it.respaldos))
            previo.evento_ids = sorted(set(previo.evento_ids) | set(it.evento_ids))
    return list(por_id.values())


def _fusionar(items: list[KnowledgeItem]) -> list[KnowledgeItem]:
    """Un solo pase con Claude que agrupa items que describen lo mismo.

    Necesario porque "compra los vuelos del jefe" y "gestiona los tiquetes de la
    gerencia" son el mismo conocimiento y ninguna heurística de texto los une.
    """
    catalogo = "\n".join(
        f"{i}. [{it.tipo}] dueño={it.dueño_principal} — {it.descripcion}"
        for i, it in enumerate(items)
    )
    prompt = (
        "Agrupa los elementos que describen EL MISMO conocimiento (mismo dueño y "
        "misma responsabilidad en la práctica, aunque estén redactados distinto).\n"
        "Devuelve solo los grupos de 2 o más índices. Los elementos únicos no se "
        "reportan. Ante la duda, NO agrupes.\n\n" + catalogo
    )
    grupos = llm.parse_json(SISTEMA_EXTRACCION, prompt, _Fusion).grupos

    fusionados: set[int] = set()
    resultado: list[KnowledgeItem] = []
    for grupo in grupos:
        indices = [i for i in grupo if 0 <= i < len(items) and i not in fusionados]
        if len(indices) < 2:
            continue
        principal = items[indices[0]]
        for i in indices[1:]:
            otro = items[i]
            principal.respaldos = sorted(set(principal.respaldos) | set(otro.respaldos))
            principal.evento_ids = sorted(set(principal.evento_ids) | set(otro.evento_ids))
        principal.respaldos = sorted(set(principal.respaldos) - {principal.dueño_principal})
        fusionados.update(indices)
        resultado.append(principal)
    resultado.extend(it for i, it in enumerate(items) if i not in fusionados)
    return resultado


# --- 2. Riesgo ------------------------------------------------------------------


def calcular_riesgo(
    items: list[KnowledgeItem],
    raw_events: list[RawEvent | dict] | None = None,
    *,
    mock: bool = False,
) -> list[RiskScore]:
    """Score 0-100 por persona. Fórmula explicable, sin LLM.

    peso(item) = PESOS[tipo], duplicado si el item no tiene respaldos.
    El total se multiplica por (1 + 0.5 * intermediación), donde la
    intermediación viene del grafo de colaboración de P1: quien hace circular
    más información del equipo es más caro de perder. Sin `raw_events` el
    multiplicador es 1 y el score es solo conocimiento.
    Se normaliza sobre el máximo del equipo.
    """
    if mock:
        return list(mocks.SCORES)
    if not items:
        return []

    puentes: dict[str, bool] = {}
    grados: dict[str, int] = {}
    central: dict[str, float] = {}
    personas: set[str] = {it.dueño_principal for it in items}
    if raw_events:
        eventos = [e if isinstance(e, RawEvent) else RawEvent.model_validate(e) for e in raw_events]
        grafo = g.construir_grafo(eventos)
        puentes = g.es_puente(grafo)
        grados = g.grado(grafo)
        central = g.intermediacion(grafo)
        personas |= set(grafo)

    brutos: dict[str, float] = {p: 0.0 for p in personas}
    criticos: dict[str, list[str]] = {p: [] for p in personas}
    totales: dict[str, int] = {p: 0 for p in personas}

    for it in items:
        dueño = it.dueño_principal
        peso = PESOS[it.tipo]
        if it.es_critico:
            peso *= MULTIPLICADOR_SIN_RESPALDO
            criticos[dueño].append(it.id)
        brutos[dueño] += peso
        totales[dueño] += 1

    for persona in brutos:
        brutos[persona] *= 1 + BONO_INTERMEDIACION * central.get(persona, 0.0)

    maximo = max(brutos.values()) or 1.0
    scores = [
        RiskScore(
            persona_id=persona,
            score=round(100 * bruto / maximo),
            items_criticos=criticos[persona],
            total_items=totales[persona],
            detalle=_detalle(persona, totales[persona], criticos[persona], puentes, grados, central),
        )
        for persona, bruto in brutos.items()
    ]
    scores.sort(key=lambda s: s.score, reverse=True)
    return scores


def _detalle(
    persona: str,
    total: int,
    criticos: list[str],
    puentes: dict[str, bool],
    grados: dict[str, int],
    central: dict[str, float],
) -> str:
    partes = [f"{total} elemento(s) a su nombre"]
    if criticos:
        partes.append(f"{len(criticos)} sin ningún respaldo (bus factor 1)")
    else:
        partes.append("todos con respaldo")
    if puentes.get(persona):
        partes.append("única conexión entre dos subgrupos del equipo")
    elif persona in grados:
        partes.append(f"colabora con {grados[persona]} persona(s)")
    if persona in central:
        partes.append(f"intermediación {central[persona]:.0%} del máximo del equipo")
    return ". ".join(partes) + "."


# --- 3. Simulación --------------------------------------------------------------


def _afectados(scenario_id: str, items: list[KnowledgeItem], objetivo_id: str | None) -> list[KnowledgeItem]:
    if scenario_id == "renuncia":
        return [i for i in items if i.dueño_principal == objetivo_id]
    if scenario_id == "robo_pc":
        return [i for i in items if i.dueño_principal == objetivo_id and i.tipo == "acceso"]
    if scenario_id == "caida_github":
        return [i for i in items if i.fuente == "github" or i.tipo == "proceso"]
    if scenario_id == "caida_meet":
        return [i for i in items if i.fuente == "meet"]
    if scenario_id == "ransomware":
        return [i for i in items if i.tipo == "acceso"]
    # apagon, evacuacion y cualquier escenario nuevo: lo que ya es frágil
    return [i for i in items if i.es_critico]


def simular(
    scenario_id: str,
    items: list[KnowledgeItem],
    objetivo_id: str | None = None,
    *,
    mock: bool = False,
) -> SimulationResult:
    """Ejecuta un escenario y genera el playbook de empalme en Markdown."""
    escenario = ESCENARIOS_POR_ID.get(scenario_id)
    if escenario is None:
        raise ValueError(f"Escenario desconocido: {scenario_id}. Opciones: {sorted(ESCENARIOS_POR_ID)}")
    if escenario.requiere_objetivo and not objetivo_id:
        raise ValueError(f"El escenario '{scenario_id}' requiere un objetivo_id (email de la persona).")

    if mock or not llm.hay_api_key():
        return mocks.SIMULACION.model_copy(update={"scenario_id": scenario_id, "objetivo_id": objetivo_id})

    # ponytail: sin embeddings ni pgvector — con decenas de items caben todos en
    # el prompt. Si el catálogo pasa de ~200 elementos, vectorizar
    # `descripcion + evidencia` y hacer retrieval antes de armar el prompt.
    afectados = _afectados(scenario_id, items, objetivo_id)
    huerfanos = [i for i in afectados if i.es_critico]
    transferibles = [i for i in afectados if not i.es_critico]

    impacto = (
        f"{len(huerfanos)} elemento(s) quedan sin dueño y sin respaldo; "
        f"{len(transferibles)} tienen a quién transferirse."
    )
    if not afectados:
        return SimulationResult(
            scenario_id=scenario_id,
            objetivo_id=objetivo_id,
            items_huerfanos=[],
            impacto="Este escenario no afecta ningún conocimiento registrado.",
            playbook_md=f"# {escenario.nombre}\n\nNo hay conocimiento registrado que este escenario ponga en riesgo.",
        )

    prompt = (
        f"## Escenario\n{escenario.nombre}: {escenario.descripcion}\n"
        + (f"Persona afectada: {objetivo_id}\n" if objetivo_id else "")
        + f"\n## Conocimiento afectado\n{_catalogo_detallado(afectados)}\n"
        + f"\n## Resto del equipo y lo que ya saben\n{_catalogo_resumido(items, afectados)}\n"
        "\n## Tu tarea\n"
        "Escribe el playbook de empalme en Markdown. Estructura:\n"
        "1. Qué se pierde (tabla: elemento, tipo, respaldo actual)\n"
        "2. Reglas tácitas que nadie más conoce — nómbralas explícitamente\n"
        "3. Quién asume qué, y por qué esa persona (usa los respaldos si existen; "
        "si no hay respaldo, propone a quien más cerca esté por lo que ya sabe)\n"
        "4. Primeras 48 horas, en pasos numerados y accionables\n"
        "5. Riesgo residual: qué se pierde igual\n\n"
        "Usa solo emails que aparezcan arriba. No inventes datos."
    )
    playbook = llm.texto(SISTEMA_PLAYBOOK, prompt)

    return SimulationResult(
        scenario_id=scenario_id,
        objetivo_id=objetivo_id,
        items_huerfanos=huerfanos,
        impacto=impacto,
        playbook_md=playbook,
    )


def _catalogo_detallado(items: list[KnowledgeItem]) -> str:
    return "\n".join(
        f"- [{it.tipo}] {it.descripcion}\n"
        f"  dueño: {it.dueño_principal} | respaldos: {', '.join(it.respaldos) or 'NINGUNO'}\n"
        f'  evidencia: "{it.evidencia}"'
        for it in items
    )


def _catalogo_resumido(todos: list[KnowledgeItem], afectados: list[KnowledgeItem]) -> str:
    ids = {it.id for it in afectados}
    resto = [it for it in todos if it.id not in ids]
    if not resto:
        return "(sin más conocimiento registrado)"
    return "\n".join(f"- {it.dueño_principal}: {it.descripcion}" for it in resto)


# --- 4. Digest semanal ----------------------------------------------------------


def generar_digest(
    items: list[KnowledgeItem],
    scores: list[RiskScore],
    *,
    limite: int = 6,
    mock: bool = False,
) -> list[Quest]:
    """Las misiones del viernes: una por cada punto único de falla."""
    if mock or not llm.hay_api_key():
        return list(mocks.QUESTS)

    orden = {s.persona_id: s.score for s in scores}
    criticos = sorted(
        (it for it in items if it.es_critico),
        key=lambda it: (orden.get(it.dueño_principal, 0), PESOS[it.tipo]),
        reverse=True,
    )[:limite]
    if not criticos:
        return []

    prompt = (
        "Estos elementos de conocimiento hoy dependen de una sola persona:\n\n"
        + "\n".join(
            f"{it.id} | [{it.tipo}] {it.descripcion} | dueño: {it.dueño_principal}"
            for it in criticos
        )
        + "\n\nEste es el resto del equipo y lo que ya sabe (para elegir a quién "
        "traspasar conocimiento):\n"
        + _catalogo_resumido(items, criticos)
        + "\n\nGenera una misión por elemento. `item_relacionado` debe ser el id "
        "exacto de la lista. `asignado_a` es el dueño actual: él o ella es quien "
        "tiene que soltar el conocimiento. `puntos` entre 10 y 30 según el riesgo."
    )
    generadas = llm.parse_json(SISTEMA_DIGEST, prompt, _Digest).quests

    validos = {it.id for it in criticos}
    return [
        Quest(
            id=f"q-{i:03d}",
            asignado_a=q.asignado_a,
            accion=q.accion,
            item_relacionado=q.item_relacionado if q.item_relacionado in validos else None,
            puntos=max(10, min(30, q.puntos)),
        )
        for i, q in enumerate(generadas, start=1)
    ]
