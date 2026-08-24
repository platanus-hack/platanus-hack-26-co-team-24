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
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from hashlib import sha256
from urllib.parse import quote

from fastapi import Body, Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from cerebro import simular
from cerebro.esquemas import ESCENARIOS, Escenario, KnowledgeItem, RawEvent
from cerebro.llm import hay_api_key

from . import FORZAR_MOCK
from . import auth
from . import bd
from . import estado as st
from . import seed
from . import slack_oauth
from .esquemas import (
    Miembro,
    Oficina,
    PeticionAvatar,
    PeticionConexion,
    PeticionQuest,
    PeticionSimular,
    PeticionTranscripciones,
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
    if (recuperados := st.rehidratar_eventos(OFICINA["id"])):
        log.info("eventos recuperados de supabase: %d (el disco de Render arranca vacío)", recuperados)
    if st.cargar_desde_bd():
        log.info("estado cargado de supabase: %d items", len(st._real.items))
    elif st.cargar_snapshot():
        log.info("estado cargado del snapshot: %d items", len(st._real.items))
    else:
        log.info("sin snapshot: sirviendo mocks hasta que corran POST /admin/procesar")
        st.cargar_usuarios()
    if FORZAR_MOCK:
        log.warning("BUSFACTOR_MOCK=1: todos los endpoints responden en mock")
    yield


app = FastAPI(
    title="Bus Factor HQ — API",
    description="P3. Los frontends solo hablan con esto. `?mock=true` en cualquier lectura devuelve el plan B del demo.",
    version="0.1.0",
    lifespan=ciclo_de_vida,
    # Terminado el hackathon: todo pide Bearer del dominio salvo
    # `auth.RUTAS_PUBLICAS`. Aquí y no en cada endpoint, para que una ruta
    # nueva nazca cerrada.
    dependencies=[Depends(auth.guardia)],
)

app.add_middleware(
    CORSMiddleware,
    # Un solo origen: el front desplegado. Con `*` cualquier página podía
    # llamar la API con el token de quien la estuviera visitando.
    allow_origins=[auth.frontend_base(), "http://localhost:5173"],
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
        hay_supabase=bd.hay_bd(),
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


def _avatar_del_cuerpo(cuerpo: PeticionAvatar) -> dict:
    if cuerpo.avatar_config:
        return cuerpo.avatar_config
    extra = dict(cuerpo.model_extra or {})
    extra.pop("email", None)
    extra.pop("avatar_config", None)
    return extra


# --- Usuario --------------------------------------------------------------------


@app.get("/auth/google", tags=["auth"])
def entrar_con_google() -> RedirectResponse:
    """La puerta. Supabase hace el OAuth y devuelve al front con el token en el
    fragmento; el dominio se exige después, al resolver el token."""
    return RedirectResponse(auth.url_login_google())


@app.get("/usuarios/me", tags=["auth"])
def yo(actual: dict = Depends(auth.usuario_del_token)) -> dict:
    email = actual["email"]
    persona = PERSONAS.get(email, {})
    return {
        "email": email,
        "nombre": persona.get("nombre") or email,
        "rol": persona.get("rol", "Equipo"),
        "sprite": persona.get("sprite", "lpc-00"),
        "avatar_config": persona.get("avatar_config") or {},
    }


@app.put("/usuarios/me/avatar", tags=["auth"])
def put_mi_avatar(cuerpo: PeticionAvatar, actual: dict = Depends(auth.usuario_del_token)) -> dict:
    return auth.guardar_avatar(actual["email"], _avatar_del_cuerpo(cuerpo))


@app.post("/conexiones", tags=["auth"])
def post_conexion(
    cuerpo: PeticionConexion,
    actual: dict = Depends(auth.usuario_del_token),
) -> dict:
    return auth.marcar_conexion(actual["email"], cuerpo.tipo)


# --- Conexiones de Slack --------------------------------------------------------
#
# Tres pasos: el usuario pide la URL con su Bearer, aprueba en Slack, y Slack nos
# devuelve al callback. El token queda en `connections` y no vuelve a salir: lo
# consultable es el estado, no la credencial.


def _pantalla_de_conexiones() -> str:
    """A dónde devolver el navegador después de Slack."""
    return f"{auth.frontend_base()}/conexiones"


@app.get("/conexiones", tags=["conexiones"])
def get_conexiones(actual: dict = Depends(auth.usuario_del_token)) -> dict:
    """El estado de las conexiones del usuario. Sin token, nunca.

    Solo se listan las que existen: el frontend trata cada fuente que le llega
    como conectada, así que anunciar una conexión que no está sería mentirle.
    """
    return {"email": actual["email"], "conexiones": slack_oauth.conexiones_de(actual["email"])}


@app.get("/conexiones/slack/iniciar", tags=["conexiones"])
def slack_iniciar(actual: dict = Depends(auth.usuario_del_token)) -> dict:
    """La URL a la que mandar el navegador. El `state` va firmado con HMAC y
    lleva dentro de quién es el flujo, porque el callback llega sin Bearer."""
    return {"url": slack_oauth.url_de_autorizacion(actual["email"]), "scopes": slack_oauth.SCOPES}


@app.get("/conexiones/slack/callback", tags=["conexiones"])
def slack_callback(
    code: str | None = Query(None),
    state: str | None = Query(None),
    error: str | None = Query(None),
):
    """A donde vuelve Slack. Redirige al frontend con el resultado en la query.

    Es el navegador del usuario el que aterriza aquí, así que un JSON de error
    sería una pantalla en blanco: todo camino termina en una redirección.
    """
    destino = _pantalla_de_conexiones()
    if error:
        return RedirectResponse(f"{destino}?slack=error&motivo={quote(error)}", status_code=302)
    if not code or not state:
        return RedirectResponse(f"{destino}?slack=error&motivo=faltan_code_o_state", status_code=302)
    try:
        email = slack_oauth.email_del_state(state)
        slack_oauth.guardar_conexion(email, slack_oauth.canjear_codigo(code))
    except HTTPException as e:
        log.warning("callback de slack falló: %s", e.detail)
        return RedirectResponse(f"{destino}?slack=error&motivo={quote(str(e.detail))}", status_code=302)
    return RedirectResponse(f"{destino}?slack=ok", status_code=302)


@app.post("/conexiones/slack/sincronizar", tags=["conexiones"])
def slack_sincronizar(
    desde: str | None = Query(None, description="Unix timestamp. Por defecto, 60 días atrás."),
    actual: dict = Depends(auth.usuario_del_token),
) -> dict:
    """Baja los mensajes del Slack del usuario y los deja donde `procesar()` los ve.

    No corre la cadena de P2 detrás: `extraer()` cuesta tokens y segundos, y
    mezclarlo aquí haría que un timeout de Claude pareciera un fallo de Slack.
    """
    email = actual["email"]
    oficina = slack_oauth.oficina_de(email)
    crudos = slack_oauth.descargar_eventos(email, desde)
    eventos = [RawEvent.model_validate(e) for e in crudos]
    resultado = st.guardar_eventos(eventos, oficina)
    canales = {e.metadata.get("canal_id") for e in eventos if e.metadata.get("canal_id")}
    return {
        **resultado,
        "mensajes": len(eventos),
        "canales": len(canales),
        "siguiente": "POST /admin/procesar para recalcular el mapa",
    }


@app.post("/conexiones/drive/transcripciones", tags=["conexiones"])
def drive_transcripciones(
    cuerpo: PeticionTranscripciones,
    actual: dict = Depends(auth.usuario_del_token),
) -> dict:
    """Transcripciones de Meet subidas a mano, ya como texto.

    Sin OAuth de Google a propósito: verificar el scope de Drive tarda días. El
    `.txt` que Meet deja en Drive llega igual, y `normalize_transcript` lo parte
    en los mismos `RawEvent` que produciría el conector.
    """
    if not cuerpo.archivos:
        raise HTTPException(422, "Manda al menos una transcripción.")

    from ingestion.meet import normalize_transcript

    email = actual["email"]
    ahora = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    crudos = []
    for archivo in cuerpo.archivos:
        if not archivo.contenido.strip():
            continue
        # El id sale del contenido: resubir el mismo archivo no duplica eventos,
        # y editarlo sí crea unos nuevos. Es lo que hace la CLI con la ruta.
        huella = sha256(f"{archivo.nombre}|{archivo.contenido}".encode()).hexdigest()[:16]
        crudos += [
            e.to_dict()
            for e in normalize_transcript(
                meeting_id=huella,
                title=archivo.nombre,
                text=archivo.contenido,
                author_email=email,
                participants=[],
                timestamp=ahora,
                metadata={"archivo": archivo.nombre},
            )
        ]
    if not crudos:
        raise HTTPException(422, "Las transcripciones venían vacías.")

    eventos = [RawEvent.model_validate(e) for e in crudos]
    resultado = st.guardar_eventos(eventos, slack_oauth.oficina_de(email))
    return {"ok": True, "eventos": len(eventos), **resultado}


# --- Admin ----------------------------------------------------------------------


@app.post("/admin/procesar", response_model=RespuestaProcesar, tags=["admin"])
def admin_procesar() -> RespuestaProcesar:
    """Corre la cadena de P2 sobre los eventos de P1 y persiste el resultado.

    Manual y a propósito: `extraer()` cuesta tokens y segundos, y nunca debe
    correr dentro de un request de lectura.
    """
    return RespuestaProcesar(**st.procesar())


def _admin_autorizado(x_admin_token: str | None = Header(None)) -> None:
    """Candado opcional para lo que escribe datos.

    El resto de `/admin/*` está abierto desde el primer día y así se quedó: es
    hackathon y solo recalcula o resetea. Este endpoint es distinto porque
    *inyecta* el conocimiento que después se atribuye a personas reales, así que
    admite cerrarse poniendo `ADMIN_TOKEN` en Render, sin tocar código ni romper
    a quien ya lo llama sin cabecera.
    """
    esperado = os.getenv("ADMIN_TOKEN", "")
    if esperado and x_admin_token != esperado:
        raise HTTPException(401, "Falta o no coincide la cabecera X-Admin-Token.")


@app.post("/admin/eventos", tags=["admin"])
def admin_eventos(
    eventos: list[RawEvent] = Body(..., description="RawEvent[] tal como los normaliza P1"),
    oficina: str = Query(OFICINA["id"], description="A qué oficina pertenecen"),
    _: None = Depends(_admin_autorizado),
) -> dict:
    """Mete eventos sin desplegar: en Render `data/raw/` viene horneado en la imagen.

    Deduplica por `id`, así que reenviar el mismo lote es inofensivo. No procesa:
    después hay que llamar `POST /admin/procesar`.
    """
    if not eventos:
        raise HTTPException(422, "Manda al menos un evento.")
    return st.guardar_eventos(eventos, oficina)


@app.post("/admin/reset", tags=["admin"])
def admin_reset() -> dict:
    """Vuelve al estado demo perfecto. Para los ensayos de P5."""
    st.reset()
    if bd.hay_bd():
        return {"ok": True, **seed.sembrar()}
    return {"ok": True, "mensaje": "Estado limpio. Corre POST /admin/procesar para repoblar."}


@app.post("/admin/sembrar", tags=["admin"])
def admin_sembrar() -> dict:
    """9 usuarios + cadena de P2 persistida en Supabase."""
    if not bd.hay_bd():
        raise HTTPException(503, "Sin credenciales de Supabase.")
    return seed.sembrar()
