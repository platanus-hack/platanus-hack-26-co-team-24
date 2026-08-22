"""El estado del mundo: qué sabe el equipo hoy y cuánto riesgo hay.

Dos estados independientes:

- **real**: sale de correr la cadena de P2 sobre los eventos de P1. Se calcula en
  `POST /admin/procesar`, nunca dentro de un request de lectura — `extraer()`
  gasta tokens y segundos, y en Railway el disco es efímero, así que la caché de
  P2 no sobrevive un reinicio. Se guarda un snapshot en `data/estado.json` para
  que el arranque en frío no salga vacío.
- **mock**: los datos escritos a mano de `cerebro.mocks`. Es el plan B del demo
  y funciona con la base de datos vacía.

Ambos aceptan completar quests, así que el momento demoable de P5 sobrevive
aunque estemos corriendo en mock.
"""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, field

from cerebro import (
    calcular_riesgo,
    cargar_eventos,
    extraer,
    generar_digest,
    resiliencia_equipo,
)
from cerebro import grafo as g
from cerebro import mocks
from cerebro.esquemas import KnowledgeItem, Quest, RawEvent, RiskScore
from cerebro.llm import hay_api_key

from . import ARCHIVO_ESTADO, DIR_EVENTOS
from . import bd
from .personas import OFICINA, PERSONAS, buscar_por_nombre, nombre_de

EMAIL = re.compile(r"[\w.+-]+@[\w.-]+\.\w+")


@dataclass
class Estado:
    items: list[KnowledgeItem] = field(default_factory=list)
    scores: list[RiskScore] = field(default_factory=list)
    quests: list[Quest] = field(default_factory=list)
    fuente: str = "vacio"  # procesado | snapshot | mock | vacio
    con_claude: bool = False

    @property
    def resiliencia(self) -> float:
        return resiliencia_equipo(self.items)

    def recalcular(self, eventos: list[RawEvent]) -> None:
        self.scores = calcular_riesgo(self.items, eventos)


_real = Estado()
_mock: Estado | None = None
_eventos: list[RawEvent] | None = None


def eventos() -> list[RawEvent]:
    """Los eventos de P1 si ya publicó; si no, el fixture de P2.

    Se pasa el directorio explícito porque `cerebro` lo resuelve contra el CWD
    mientras el PR #2 siga abierto.
    """
    global _eventos
    if _eventos is None:
        _eventos = cargar_eventos(DIR_EVENTOS)
    return _eventos


def estado_mock() -> Estado:
    global _mock
    if _mock is None:
        _mock = Estado(
            items=[i.model_copy(deep=True) for i in mocks.ITEMS],
            scores=[s.model_copy(deep=True) for s in mocks.SCORES],
            quests=[q.model_copy(deep=True) for q in mocks.QUESTS],
            fuente="mock",
        )
    return _mock


def obtener(mock: bool) -> Estado:
    """El estado que corresponde. En real sin datos, cae a mock en vez de vaciar
    la pantalla del frontend: una oficina sin personajes parece un bug."""
    if mock:
        return estado_mock()
    return _real if _real.items else estado_mock()


# --- Procesar: la cadena completa de P2 -----------------------------------------


def procesar() -> dict:
    """`cargar_eventos → extraer → calcular_riesgo → generar_digest`, y persiste.

    Es la Cita H3 en una función. Se corre a mano, no hay colas ni schedulers.
    """
    inicio = time.perf_counter()
    evs = eventos()
    items = extraer(evs)
    scores = calcular_riesgo(items, evs)
    quests = generar_digest(items, scores, evs)

    _real.items, _real.scores, _real.quests = items, scores, quests
    _real.fuente = "procesado"
    _real.con_claude = hay_api_key()
    guardar_snapshot()
    persistir_en_bd(_real)

    return {
        "eventos": len(evs),
        "items": len(items),
        "personas": len(scores),
        "quests": len(quests),
        "resiliencia_equipo": _real.resiliencia,
        "segundos": round(time.perf_counter() - inicio, 2),
        "con_claude": _real.con_claude,
    }


def guardar_snapshot() -> None:
    ARCHIVO_ESTADO.parent.mkdir(parents=True, exist_ok=True)
    ARCHIVO_ESTADO.write_text(
        json.dumps(
            {
                "items": [i.model_dump() for i in _real.items],
                "scores": [s.model_dump() for s in _real.scores],
                "quests": [q.model_dump() for q in _real.quests],
                "con_claude": _real.con_claude,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def cargar_snapshot() -> bool:
    """Arranque en frío: si hay una corrida buena en disco, se usa."""
    if not ARCHIVO_ESTADO.exists():
        return False
    crudo = json.loads(ARCHIVO_ESTADO.read_text(encoding="utf-8"))
    _real.items = [KnowledgeItem.model_validate(i) for i in crudo["items"]]
    _real.scores = [RiskScore.model_validate(s) for s in crudo["scores"]]
    _real.quests = [Quest.model_validate(q) for q in crudo["quests"]]
    _real.con_claude = crudo.get("con_claude", False)
    _real.fuente = "snapshot"
    return bool(_real.items)


# --- Completar una quest: lo único que mueve el puntaje -------------------------


def elegir_respaldo(quest: Quest, item: KnowledgeItem, propuesto: str | None) -> str | None:
    """A quién le queda el conocimiento.

    El frontend puede decirlo explícito. Si no, se deduce de la `accion` — el
    modelo escribe "comparte el acceso con Samuel", no el email — y como último
    recurso se usa a quien más colabora con el dueño según el grafo de P1.
    """
    if propuesto:
        return propuesto
    for candidato in EMAIL.findall(quest.accion):
        if candidato != item.dueño_principal:
            return candidato
    if (por_nombre := buscar_por_nombre(quest.accion, excluir=item.dueño_principal)):
        return por_nombre
    cercanos = g.colaboradores(g.construir_grafo(eventos()), item.dueño_principal)
    return cercanos[0][0] if cercanos else None


def completar_quest(quest_id: str, respaldo: str | None, mock: bool) -> dict:
    """Marca la quest y **cambia los datos**, que es lo que sube el puntaje.

    `RiskScore.score` es relativo al equipo y por diseño no mide progreso; el
    número que sube es `resiliencia_equipo()`. Para que suba de verdad, el
    receptor tiene que quedar registrado como respaldo del item — si solo
    marcáramos un booleano, el puntaje del pitch no se movería.
    """
    estado = obtener(mock)
    quest = next((q for q in estado.quests if q.id == quest_id), None)
    if quest is None:
        raise KeyError(quest_id)

    antes = estado.resiliencia
    item = next((i for i in estado.items if i.id == quest.item_relacionado), None)
    elegido: str | None = None

    # Idempotente: repetir la petición no vuelve a sumar respaldos.
    if quest.estado != "completada":
        quest.estado = "completada"
        if item is not None:
            elegido = elegir_respaldo(quest, item, respaldo)
            if elegido and elegido not in item.respaldos and elegido != item.dueño_principal:
                item.respaldos = sorted([*item.respaldos, elegido])
            estado.recalcular(eventos())
            if estado is _real:
                guardar_snapshot()
                persistir_en_bd(estado)

    despues = estado.resiliencia
    return {
        "quest": quest,
        "item": item,
        "respaldo_email": elegido,
        "resiliencia_equipo": despues,
        "delta": round(despues - antes, 1),
    }


def persistir_en_bd(estado: Estado) -> None:
    """Espejo en Supabase. Si no hay credenciales o la red falla, el disco basta."""
    if not bd.hay_bd():
        return
    oficina = OFICINA["id"]
    try:
        if estado.items:
            bd.upsert(
                "knowledge_items",
                [
                    {
                        "id": i.id,
                        "office_id": oficina,
                        "dueno_principal": i.dueño_principal,
                        "tipo": i.tipo,
                        "payload": i.model_dump(),
                    }
                    for i in estado.items
                ],
                "id",
            )
        if estado.scores:
            bd.upsert(
                "risk_scores",
                [
                    {"persona_id": s.persona_id, "office_id": oficina, "payload": s.model_dump()}
                    for s in estado.scores
                ],
                "office_id,persona_id",
            )
        if estado.quests:
            bd.upsert(
                "quests",
                [
                    {
                        "id": q.id,
                        "office_id": oficina,
                        "asignado_a": q.asignado_a,
                        "estado": q.estado,
                        "payload": q.model_dump(),
                    }
                    for q in estado.quests
                ],
                "id",
            )
    except Exception as e:
        print(f"[backend] persistir_en_bd falló ({type(e).__name__}: {e}); seguimos con disco")


def cargar_usuarios() -> int:
    """Trae avatares y nombres de la BD encima de la semilla en memoria."""
    if not bd.hay_bd():
        return 0
    try:
        filas = bd.rest("GET", "users", params={"select": "email,nombre,rol,sprite,avatar_config"}) or []
    except Exception as e:
        print(f"[backend] cargar_usuarios falló ({type(e).__name__}: {e})")
        return 0
    if not isinstance(filas, list):
        filas = []
    for fila in filas:
        email = fila["email"]
        base = PERSONAS.setdefault(
            email, {"nombre": nombre_de(email), "rol": "Equipo", "sprite": "lpc-00", "avatar_config": {}}
        )
        for campo in ("nombre", "rol", "sprite", "avatar_config"):
            if fila.get(campo):
                base[campo] = fila[campo]
    return len(filas)


def cargar_desde_bd() -> bool:
    """Arranque en frío desde Supabase. Si está vacío, el caller prueba el disco."""
    if not bd.hay_bd():
        bd.aviso_si_falta()
        return False
    oficina = OFICINA["id"]
    try:
        items = bd.rest("GET", "knowledge_items", params={"office_id": f"eq.{oficina}", "select": "payload"}) or []
        scores = bd.rest("GET", "risk_scores", params={"office_id": f"eq.{oficina}", "select": "payload"}) or []
        quests = bd.rest("GET", "quests", params={"office_id": f"eq.{oficina}", "select": "payload"}) or []
    except Exception as e:
        print(f"[backend] cargar_desde_bd falló ({type(e).__name__}: {e})")
        return False
    cargar_usuarios()
    if not items:
        return False
    _real.items = [KnowledgeItem.model_validate(f["payload"]) for f in items]
    _real.scores = [RiskScore.model_validate(f["payload"]) for f in scores]
    _real.quests = [Quest.model_validate(f["payload"]) for f in quests]
    _real.fuente = "supabase"
    return True


def reset() -> None:
    """Vuelve al estado demo perfecto. Se corre veinte veces entre ensayos."""
    global _mock, _eventos
    _mock = None
    _eventos = None
    _real.items, _real.scores, _real.quests = [], [], []
    _real.fuente = "vacio"
    ARCHIVO_ESTADO.unlink(missing_ok=True)
