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
BONO_INTERMEDIACION = 0.5  # la persona mas central del grafo pesa 1.5x
RESPALDOS_PARA_CUBRIR = 2  # dos respaldos = conocimiento cubierto
RIESGO_RESIDUAL = 0.1      # lo cubierto igual pesa algo: la gente olvida
PISO_NORMALIZACION = 6.0   # = un acceso sin ningun respaldo. Ver `cobertura`.


def cobertura(item: KnowledgeItem) -> float:
    """0.0 = nadie mas lo sabe, 1.0 = dos o mas personas lo respaldan."""
    return min(1.0, len(item.respaldos) / RESPALDOS_PARA_CUBRIR)


def peso_riesgo(item: KnowledgeItem, pesos: dict[str, float] | None = None) -> float:
    """Cuanto riesgo aporta un item: su peso por tipo, descontado por cobertura.

    Sin respaldos vale el peso completo; con uno vale ~55%; con dos o mas cae al
    10%. Un respaldo unico sigue siendo fragil (bus factor 2), por eso no baja a
    cero de golpe.
    """
    base = (pesos or PESOS)[item.tipo]
    return base * (1 - (1 - RIESGO_RESIDUAL) * cobertura(item))


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


def _formatear_metadata(metadata: dict, limite: int = 300) -> str:
    """Los archivos tocados de un commit son la señal más fuerte de quién toca qué.

    P1 los pone en `metadata`; descartarlos sería tirar su mejor dato.
    """
    if not metadata:
        return ""
    partes = []
    for clave, valor in metadata.items():
        texto = ", ".join(str(v) for v in valor) if isinstance(valor, list) else str(valor)
        partes.append(f"{clave}={texto}")
    linea = " | ".join(partes)
    return f"\nmetadata: {linea[:limite]}"


def _formatear_eventos(eventos: list[RawEvent]) -> str:
    lineas = []
    for ev in eventos:
        participantes = ", ".join(ev.participantes) or "—"
        lineas.append(
            f"[{ev.id}] fuente={ev.fuente} tipo={ev.tipo} autor={ev.autor_email} "
            f"participantes={participantes} fecha={ev.timestamp}"
            f"{_formatear_metadata(ev.metadata)}\n{ev.contenido}"
        )
    return "\n\n---\n\n".join(lineas)


def _emails_de(eventos: list[RawEvent]) -> set[str]:
    import re

    return (
        {e.autor_email for e in eventos}
        | {p for e in eventos for p in e.participantes}
        | {p for e in eventos for p in re.findall(r"[\w.+-]+@[\w.-]+\.\w+", e.contenido)}
    )


def extraer(raw_events: list[RawEvent | dict], *, fusionar: bool = True, mock: bool = False) -> list[KnowledgeItem]:
    """RawEvent[] -> KnowledgeItem[]. Cacheado en disco por lote."""
    if mock or not llm.hay_api_key():
        return list(mocks.ITEMS)

    eventos = [e if isinstance(e, RawEvent) else RawEvent.model_validate(e) for e in raw_events]
    if not eventos:
        return []

    permitidos = _emails_de(eventos)
    descartados = 0

    items: list[KnowledgeItem] = []
    for inicio in range(0, len(eventos), LOTE):
        lote = eventos[inicio : inicio + LOTE]
        prompt = (
            "Extrae los elementos de conocimiento de estos eventos:\n\n"
            + _formatear_eventos(lote)
        )
        try:
            salida = llm.parse_json(SISTEMA_EXTRACCION, prompt, _LoteExtraido)
        except Exception as e:  # un lote caído no puede tumbar los otros nueve
            print(f"[cerebro] lote {inicio // LOTE + 1} falló ({type(e).__name__}: {e}), se omite")
            continue
        for it in salida.items:
            # El prompt lo pide, pero pedirlo no basta: si el dueño no existe en
            # los eventos el item se cae entero, y los respaldos inventados se
            # filtran. Un respaldo falso es peor que ninguno: apaga la alarma.
            if it.dueno_principal not in permitidos:
                descartados += 1
                continue
            items.append(
                KnowledgeItem(
                    id=_id_item(it.dueno_principal, it.descripcion),
                    tipo=it.tipo,
                    descripcion=it.descripcion,
                    dueño_principal=it.dueno_principal,
                    respaldos=sorted((set(it.respaldos) & permitidos) - {it.dueno_principal}),
                    fuente=it.fuente,
                    evidencia=it.evidencia,
                    evento_ids=it.evento_ids,
                )
            )

    if descartados:
        print(f"[cerebro] {descartados} elemento(s) descartados: dueño inventado")

    if not items:
        print("[cerebro] ningún lote produjo elementos; devolviendo mocks")
        return list(mocks.ITEMS)

    items = _dedup_exacto(items)
    if not (fusionar and len(items) > 1):
        return items
    try:
        return _fusionar(items)
    except Exception as e:
        print(f"[cerebro] fusión omitida ({type(e).__name__}: {e})")
        return items


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
    pesos: dict[str, float] | None = None,
    mock: bool = False,
) -> list[RiskScore]:
    """Score 0-100 por persona. Fórmula explicable, sin LLM.

    riesgo(persona) = Σ peso_riesgo(item) × (1 + 0.5 × intermediación)

    `peso_riesgo` descuenta por cobertura: lo que dos personas saben casi no
    pesa. La intermediación sale del grafo de colaboración de P1 — quien hace
    circular más información es más caro de perder. Sin `raw_events` el
    multiplicador es 1.

    El `score` 0-100 es **relativo al equipo** (es lo que P4 necesita para pintar
    la oficina), pero se normaliza contra `max(máximo del equipo,
    PISO_NORMALIZACION)`: si nadie acumula más riesgo que un solo acceso sin
    respaldo, nadie sale en rojo. `riesgo_absoluto` es el número comparable
    entre semanas; para el puntaje del equipo usar `resiliencia_equipo()`.
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
        if it.es_critico:
            criticos[dueño].append(it.id)
        brutos[dueño] += peso_riesgo(it, pesos)
        totales[dueño] += 1

    for persona in brutos:
        brutos[persona] *= 1 + BONO_INTERMEDIACION * central.get(persona, 0.0)

    maximo = max(max(brutos.values(), default=0.0), PISO_NORMALIZACION)
    scores = [
        RiskScore(
            persona_id=persona,
            score=round(100 * bruto / maximo),
            riesgo_absoluto=round(bruto, 2),
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


def resiliencia_equipo(items: list[KnowledgeItem]) -> float:
    """0-100: qué porcentaje del conocimiento del equipo está cubierto.

    Este SÍ es el número del pitch: absoluto, comparable entre semanas y sube
    cuando alguien completa una quest. El `score` individual es relativo al
    equipo y por diseño no sirve para medir progreso.
    """
    if not items:
        return 100.0
    total = sum(PESOS[it.tipo] for it in items)
    cubierto = sum(PESOS[it.tipo] * cobertura(it) for it in items)
    return round(100 * cubierto / total, 1)


# --- 3. Simulación --------------------------------------------------------------


PALABRAS_GITHUB = ("github", "repo", "deploy", "despliegue", "rollback", "merge", "pull request", " pr ", "rama", "commit")


def _menciona(item: KnowledgeItem, palabras: tuple[str, ...]) -> bool:
    texto = f" {item.descripcion} {item.evidencia} ".lower()
    return any(p in texto for p in palabras)


# Cada escenario tiene que producir un conjunto DISTINTO, o el jurado nota que
# los siete botones de la consola hacen lo mismo.
FILTROS = {
    "renuncia": lambda i, obj: i.dueño_principal == obj,
    "robo_pc": lambda i, obj: i.dueño_principal == obj and i.tipo == "acceso",
    "caida_github": lambda i, obj: i.fuente == "github" or _menciona(i, PALABRAS_GITHUB),
    "caida_meet": lambda i, obj: i.fuente == "meet",
    # se detiene la ejecución, no se pierde el conocimiento
    "apagon": lambda i, obj: i.tipo == "proceso",
    # continuidad total: todo lo que hoy depende de una sola cabeza
    "evacuacion": lambda i, obj: i.es_critico,
    "ransomware": lambda i, obj: i.tipo in ("acceso", "proceso"),
}


def _afectados(scenario_id: str, items: list[KnowledgeItem], objetivo_id: str | None) -> list[KnowledgeItem]:
    filtro = FILTROS.get(scenario_id, lambda i, obj: i.es_critico)
    return [i for i in items if filtro(i, objetivo_id)]


def _playbook_de_respaldo(
    escenario,
    afectados: list[KnowledgeItem],
    objetivo_id: str | None,
    sucesores: dict[str, list[str]] | None = None,
) -> str:
    """Playbook determinista, sin LLM. Datos reales, sin narración.

    Se usa cuando no hay API key o cuando la llamada falla o se pasa del tiempo.
    Vale más un documento feo con los datos correctos que un error en vivo — y
    mucho más que el playbook de otro escenario.
    """
    huerfanos = [i for i in afectados if i.es_critico]
    transferibles = [i for i in afectados if not i.es_critico]
    partes = [
        f"# {escenario.nombre}",
        "",
        f"{escenario.descripcion}",
        f"\n**Objetivo:** {objetivo_id}" if objetivo_id else "",
        "",
        f"## Sin respaldo — {len(huerfanos)} elemento(s)",
        "",
    ]
    sucesores = sucesores or {}
    partes += [
        f"- **{i.descripcion}** ({i.tipo}, dueño {i.dueño_principal})\n"
        f"  - evidencia: «{i.evidencia}»"
        + (
            f"\n  - candidato por cercanía: {sucesores[i.dueño_principal][0]}"
            if sucesores.get(i.dueño_principal)
            else ""
        )
        for i in huerfanos
    ] or ["_Ninguno._"]
    partes += ["", f"## Con respaldo — {len(transferibles)} elemento(s)", ""]
    partes += [
        f"- {i.descripcion} ({i.dueño_principal} → {', '.join(i.respaldos)})"
        for i in transferibles
    ] or ["_Ninguno._"]
    partes += [
        "",
        "## Primeras 48 horas",
        "",
        "1. Cubrir primero los elementos sin respaldo de la lista de arriba.",
        "2. El candidato por cercanía sale de co-participación real, no de que ya",
        "   sepa hacerlo: hay que sentarlo con el dueño, no solo asignárselo.",
        "3. Verificar que el respaldo puede ejecutar la tarea, no solo que sabe de ella.",
        "",
        "_Documento generado sin narración: el servicio de IA no estaba disponible._",
    ]
    return "\n".join(p for p in partes if p is not None)


def _emails_inventados(texto: str, permitidos: set[str]) -> list[str]:
    """Emails que aparecen en el playbook y no existen en los datos.

    El playbook es texto libre, no pasa por structured outputs: es el único
    punto donde el modelo puede inventar una persona. Y es LA diapositiva.
    """
    import re

    return sorted({e for e in re.findall(r"[\w.+-]+@[\w.-]+\.\w+", texto) if e not in permitidos})


def simular(
    scenario_id: str,
    items: list[KnowledgeItem],
    objetivo_id: str | None = None,
    raw_events: list[RawEvent | dict] | None = None,
    *,
    timeout: float = 25.0,
    mock: bool = False,
) -> SimulationResult:
    """Ejecuta un escenario y genera el playbook de empalme en Markdown.

    Con `raw_events` el prompt recibe además con quién colabora realmente cada
    persona afectada, que es lo que permite proponer un sucesor cuando el item
    no tiene respaldo. Sin ellos el modelo solo puede adivinar por el texto.

    Nunca levanta por culpa del LLM: si no hay API key, si la llamada falla o si
    se pasa de `timeout` segundos, cae a un playbook determinista construido con
    los mismos datos reales y lo anota en `advertencias`. Lo único que sí levanta
    es un `scenario_id` inválido o un objetivo faltante — eso es error de quien
    llama, no del servicio.
    """
    escenario = ESCENARIOS_POR_ID.get(scenario_id)
    if escenario is None:
        raise ValueError(f"Escenario desconocido: {scenario_id}. Opciones: {sorted(ESCENARIOS_POR_ID)}")
    if escenario.requiere_objetivo and not objetivo_id:
        raise ValueError(f"El escenario '{scenario_id}' requiere un objetivo_id (email de la persona).")

    if mock:
        return mocks.SIMULACION.model_copy(
            update={"scenario_id": scenario_id, "objetivo_id": objetivo_id, "generado_por": "mock"}
        )

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

    sucesores = _sucesores_por_cercania(afectados, raw_events)
    base = SimulationResult(
        scenario_id=scenario_id,
        objetivo_id=objetivo_id,
        items_huerfanos=huerfanos,
        impacto=impacto,
        playbook_md=_playbook_de_respaldo(escenario, afectados, objetivo_id, sucesores),
        generado_por="respaldo",
    )
    if not llm.hay_api_key():
        base.advertencias = ["Sin ANTHROPIC_API_KEY: playbook sin narración."]
        return base

    prompt = (
        f"## Escenario\n{escenario.nombre}: {escenario.descripcion}\n"
        + (f"Persona afectada: {objetivo_id}\n" if objetivo_id else "")
        + f"\n## Conocimiento afectado\n{_catalogo_detallado(afectados)}\n"
        + f"\n## Resto del equipo y lo que ya saben\n{_catalogo_resumido(items, afectados)}\n"
        + _bloque_colaboracion(afectados, raw_events)
        + "\n## Tu tarea\n"
        "Escribe el playbook de empalme en Markdown. Estructura:\n"
        "1. Qué se pierde (tabla: elemento, tipo, respaldo actual)\n"
        "2. Reglas tácitas que nadie más conoce — nómbralas explícitamente\n"
        "3. Quién asume qué, y por qué esa persona. Si el elemento tiene "
        "respaldos, son ellos. Si no tiene, elige a quien más colabore con el "
        "dueño según el grafo de arriba, y di explícitamente que es una "
        "propuesta por cercanía, no alguien que ya sepa hacerlo\n"
        "4. Primeras 48 horas, en pasos numerados y accionables\n"
        "5. Riesgo residual: qué se pierde igual\n\n"
        "Usa solo emails que aparezcan arriba. No inventes datos."
    )
    try:
        playbook = llm.texto(SISTEMA_PLAYBOOK, prompt, timeout=timeout)
    except Exception as e:  # timeout, rate limit, red: el demo sigue
        base.advertencias = [f"Playbook degradado ({type(e).__name__}): {e}"]
        return base

    permitidos = {i.dueño_principal for i in items} | {r for i in items for r in i.respaldos}
    inventados = _emails_inventados(playbook, permitidos)
    return SimulationResult(
        scenario_id=scenario_id,
        objetivo_id=objetivo_id,
        items_huerfanos=huerfanos,
        impacto=impacto,
        playbook_md=playbook,
        advertencias=[f"Email inventado en el playbook: {e}" for e in inventados],
        generado_por="claude",
    )


def _catalogo_detallado(items: list[KnowledgeItem]) -> str:
    return "\n".join(
        f"- [{it.tipo}] {it.descripcion}\n"
        f"  dueño: {it.dueño_principal} | respaldos: {', '.join(it.respaldos) or 'NINGUNO'}\n"
        f'  evidencia: "{it.evidencia}"'
        for it in items
    )


def _sucesores_por_cercania(
    afectados: list[KnowledgeItem], raw_events: list[RawEvent | dict] | None
) -> dict[str, list[str]]:
    """Dueño afectado -> personas con las que más colabora, de mayor a menor."""
    if not raw_events:
        return {}
    eventos = [e if isinstance(e, RawEvent) else RawEvent.model_validate(e) for e in raw_events]
    grafo = g.construir_grafo(eventos)
    return {
        dueño: [p for p, _ in g.colaboradores(grafo, dueño)]
        for dueño in {i.dueño_principal for i in afectados}
    }


def _bloque_colaboracion(
    afectados: list[KnowledgeItem], raw_events: list[RawEvent | dict] | None
) -> str:
    """Con quién trabaja de verdad cada dueño afectado, según los eventos.

    Sin esto el modelo propone sucesores por intuición del texto. Con esto los
    propone por co-participación medida, que es lo que pide el documento de P2.
    """
    if not raw_events:
        return ""
    eventos = [e if isinstance(e, RawEvent) else RawEvent.model_validate(e) for e in raw_events]
    grafo = g.construir_grafo(eventos)
    lineas = []
    for dueño in sorted({i.dueño_principal for i in afectados}):
        cercanos = g.colaboradores(grafo, dueño)
        if cercanos:
            detalle = ", ".join(f"{p} ({n} interacciones)" for p, n in cercanos)
            lineas.append(f"- {dueño} trabaja sobre todo con: {detalle}")
    if not lineas:
        return ""
    return (
        "\n## Con quién colabora cada afectado (co-participación real en Slack, "
        "GitHub y Meet)\n" + "\n".join(lineas) + "\n"
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
    raw_events: list[RawEvent | dict] | None = None,
    *,
    limite: int = 6,
    mock: bool = False,
) -> list[Quest]:
    """Las misiones del viernes: una por cada punto único de falla.

    Con `raw_events` la quest nombra a un receptor concreto, elegido por
    co-participación real y no al azar: "comparte el acceso con Samuel" en vez
    de "comparte el acceso con alguien".
    """
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
        + _bloque_colaboracion(criticos, raw_events)
        + "\n\nGenera una misión por elemento. Nombra en la acción a la persona "
        "que debe recibir el conocimiento, elegida por co-participación. `item_relacionado` debe ser el id "
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
