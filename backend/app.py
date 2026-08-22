"""La API que consumen P4 (juego) y P5 (dashboard).

Un solo FastAPI. Los frontends nunca hablan con Slack, Claude ni Supabase: solo
con esto. Los modelos que se devuelven son los de `cerebro/esquemas.py` tal
cual, así que `/docs` es documentación viva y siempre correcta.

Todos los endpoints de lectura aceptan `?mock=true`, que devuelve los datos
escritos a mano de P2 sin tocar nada más. Es el plan B del demo: funciona con la
base vacía, sin API key y sin red.

    uv run uvicorn backend.app:app --reload --port 8000
"""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager

from fastapi import Body, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware

from cerebro import simular
from cerebro.esquemas import ESCENARIOS, Escenario, KnowledgeItem
from cerebro.llm import hay_api_key

from . import FORZAR_MOCK
from . import estado as st
from .esquemas import (
    Miembro,
    Oficina,
    PeticionQuest,
    PeticionSimular,
    RespuestaDigest,
    RespuestaOficina,
    RespuestaProcesar,
    RespuestaQuest,
    RespuestaRiesgo,
    Salud,
)
from .personas import OFICINA, PERSONAS, nombre_de

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("api")


@asynccontextmanager
async def ciclo_de_vida(app: FastAPI):
    if st.cargar_snapshot():
        log.info("estado cargado del snapshot: %d items", len(st._real.items))
    else:
        log.info("sin snapshot: sirviendo mocks hasta que corran POST /admin/procesar")
    if FORZAR_MOCK:
        log.warning("BUSFACTOR_MOCK=1: todos los endpoints responden en mock")
    yield


app = FastAPI(
    title="Bus Factor HQ — API",
    description="P3. Los frontends solo hablan con esto. `?mock=true` en cualquier lectura devuelve el plan B del demo.",
    version="0.1.0",
    lifespan=ciclo_de_vida,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def cronometrar(request: Request, call_next):
    """Cuando algo falle en integración, este log resuelve la discusión."""
    inicio = time.perf_counter()
    respuesta = await call_next(request)
    ms = (time.perf_counter() - inicio) * 1000
    log.info("%s %s → %d en %.0f ms", request.method, request.url.path, respuesta.status_code, ms)
    return respuesta


def _mock(mock: bool) -> bool:
    return mock or FORZAR_MOCK


# --- Lectura --------------------------------------------------------------------


@app.get("/salud", response_model=Salud, tags=["meta"])
def salud() -> Salud:
    estado = st._real
    return Salud(
        hay_api_key=hay_api_key(),
        fuente_datos=estado.fuente if estado.items else "mock",
        items=len(estado.items),
        forzar_mock=FORZAR_MOCK,
    )


@app.get("/oficina", response_model=RespuestaOficina, tags=["oficina"])
def oficina(mock: bool = Query(False)) -> RespuestaOficina:
    """Los miembros con su avatar y su riesgo. Es lo que pinta la oficina de P4."""
    estado = st.obtener(_mock(mock))
    por_email = {s.persona_id: s for s in estado.scores}

    miembros = []
    for email in [*PERSONAS, *(e for e in por_email if e not in PERSONAS)]:
        persona = PERSONAS.get(email, {})
        score = por_email.get(email)
        miembros.append(
            Miembro(
                email=email,
                nombre=persona.get("nombre") or nombre_de(email),
                rol=persona.get("rol", "Equipo"),
                sprite=persona.get("sprite", "lpc-00"),
                avatar_config=persona.get("avatar_config", {}),
                score=score.score if score else 0,
                items_criticos=score.items_criticos if score else [],
                total_items=score.total_items if score else 0,
                detalle=score.detalle if score else "Sin elementos propios.",
            )
        )
    miembros.sort(key=lambda m: m.score, reverse=True)
    return RespuestaOficina(
        oficina=Oficina(**OFICINA),
        miembros=miembros,
        resiliencia_equipo=estado.resiliencia,
    )


@app.get("/riesgo", response_model=RespuestaRiesgo, tags=["oficina"])
def riesgo(mock: bool = Query(False)) -> RespuestaRiesgo:
    """`score` es relativo al equipo (colores de P4). `resiliencia_equipo` es el
    número absoluto del pitch: es el que sube cuando se completa una quest."""
    estado = st.obtener(_mock(mock))
    return RespuestaRiesgo(scores=estado.scores, resiliencia_equipo=estado.resiliencia)


@app.get("/conocimiento", response_model=list[KnowledgeItem], tags=["oficina"])
def conocimiento(
    persona: str | None = Query(None, description="Email. Cruza con dueño y con respaldos."),
    tipo: str | None = Query(None, description="tarea | acceso | regla_tacita | proceso"),
    solo_criticos: bool = Query(False, description="Solo los que no tienen ningún respaldo"),
    mock: bool = Query(False),
) -> list[KnowledgeItem]:
    items = st.obtener(_mock(mock)).items
    if persona:
        items = [i for i in items if persona in (i.dueño_principal, *i.respaldos)]
    if tipo:
        items = [i for i in items if i.tipo == tipo]
    if solo_criticos:
        items = [i for i in items if i.es_critico]
    return items


@app.get("/escenarios", response_model=list[Escenario], tags=["simulacion"])
def escenarios() -> list[Escenario]:
    """Los 7 de la consola arcade. `requiere_objetivo` dice cuáles piden persona."""
    return ESCENARIOS


@app.post("/simular", tags=["simulacion"])
def post_simular(cuerpo: PeticionSimular, mock: bool = Query(False)):
    """Lo único que corre en vivo frente al jurado.

    Nunca falla por culpa del LLM: si Claude no responde a tiempo, `cerebro`
    devuelve un playbook determinista con los mismos datos y lo anota en
    `advertencias`. Lo único que sí es error es pedir un escenario inexistente o
    no mandar objetivo cuando el escenario lo exige.
    """
    estado = st.obtener(_mock(mock))
    try:
        resultado = simular(
            cuerpo.scenario_id,
            estado.items,
            cuerpo.objetivo_id,
            st.eventos(),
            mock=_mock(mock),
        )
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    for aviso in resultado.advertencias:
        log.warning("simular(%s): %s", cuerpo.scenario_id, aviso)
    return resultado


@app.get("/digest", response_model=RespuestaDigest, tags=["quests"])
def digest(mock: bool = Query(False)) -> RespuestaDigest:
    """Las quests del viernes y el puntaje del equipo."""
    estado = st.obtener(_mock(mock))
    return RespuestaDigest(
        quests=estado.quests,
        resiliencia_equipo=estado.resiliencia,
        puntos_disponibles=sum(q.puntos for q in estado.quests if q.estado != "completada"),
        puntos_ganados=sum(q.puntos for q in estado.quests if q.estado == "completada"),
    )


@app.put("/quests/{quest_id}", response_model=RespuestaQuest, tags=["quests"])
def put_quest(
    quest_id: str,
    cuerpo: PeticionQuest = Body(default_factory=PeticionQuest),
    mock: bool = Query(False),
) -> RespuestaQuest:
    """Completar una quest registra el respaldo y sube `resiliencia_equipo`.

    Si `respaldo_email` no viene, se deduce de la acción de la quest y, en
    último caso, del grafo de colaboración. Es idempotente.
    """
    try:
        return RespuestaQuest(**st.completar_quest(quest_id, cuerpo.respaldo_email, _mock(mock)))
    except KeyError as e:
        raise HTTPException(404, f"No existe la quest {quest_id}") from e


# --- Admin ----------------------------------------------------------------------


@app.post("/admin/procesar", response_model=RespuestaProcesar, tags=["admin"])
def admin_procesar() -> RespuestaProcesar:
    """Corre la cadena de P2 sobre los eventos de P1 y persiste el resultado.

    Manual y a propósito: `extraer()` cuesta tokens y segundos, y nunca debe
    correr dentro de un request de lectura.
    """
    return RespuestaProcesar(**st.procesar())


@app.post("/admin/reset", tags=["admin"])
def admin_reset() -> dict:
    """Vuelve al estado demo perfecto. Para los ensayos de P5."""
    st.reset()
    return {"ok": True, "mensaje": "Estado limpio. Corre POST /admin/procesar para repoblar."}
