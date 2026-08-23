"""Check runnable de la API. Sin API key, sin red, sin framework de tests.

    python test_backend.py

Cubre lo que rompe el demo en silencio: que el contrato que consumen P4 y P5 no
cambie de forma, que `?mock=true` funcione con la base vacía, y que completar
una quest mueva de verdad el puntaje del equipo.
"""

import os

os.environ["BUSFACTOR_SIN_BD"] = "1"

import contextlib
import json
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend import auth
from backend import bd
from backend import estado as st
from backend import slack_oauth
from backend.app import app

cliente = TestClient(app)

SLACK_ENV = {
    "SLACK_CLIENT_ID": "123.456",
    "SLACK_CLIENT_SECRET": "secreto-de-prueba",
    "SLACK_REDIRECT_URI": "http://localhost:8000/conexiones/slack/callback",
}

TOKEN_FALSO = "xoxb-token-que-jamas-debe-salir"


@contextlib.contextmanager
def con_slack(**extra):
    """Las tres variables de la app de Slack, solo mientras dure el bloque."""
    with patch.dict("os.environ", {**SLACK_ENV, **extra}):
        yield


@contextlib.contextmanager
def como(email="ana@empresa.com"):
    """Suplanta el Bearer sin hablar con Supabase.

    `usuario_del_token` valida contra la red; los tests no salen de la máquina,
    así que se reemplaza la dependencia, que es el punto de corte que FastAPI
    ofrece justo para esto.
    """
    app.dependency_overrides[auth.usuario_del_token] = lambda: {"id": "u-1", "email": email}
    try:
        yield {"Authorization": "Bearer lo-que-sea"}
    finally:
        app.dependency_overrides.pop(auth.usuario_del_token, None)


@contextlib.contextmanager
def supabase_falso(conexiones=None):
    """Un Supabase de mentira en memoria: sin red y sin credenciales reales.

    Solo entiende las dos consultas que hace `slack_oauth`: buscar el usuario y
    leer/escribir su conexión.
    """
    filas = list(conexiones or [])

    def rest(metodo, tabla, *, params=None, json=None, extra_headers=None):
        if tabla == "users":
            return [{"id": "u-1", "office_id": "of-demo"}]
        if tabla == "connections":
            if metodo != "GET":
                filas.append(json if isinstance(json, dict) else json[0])
                return filas
            # PostgREST devuelve solo las columnas del `select`. El doble lo
            # respeta a propósito: si no, un `select` que pidiera el token
            # pasaría desapercibido y el test de "el token nunca sale" mentiría.
            columnas = (params or {}).get("select", "*").split(",")
            if columnas == ["*"]:
                return filas
            return [{c: f[c] for c in columnas if c in f} for f in filas]
        return []

    with patch.object(bd, "hay_bd", return_value=True), \
         patch.object(bd, "rest", side_effect=rest), \
         patch.object(bd, "upsert", side_effect=lambda t, f, c: rest("POST", t, json=f)):
        yield filas


def mock_limpio():
    """Vuelve el estado mock a su punto de partida sin tocar el disco.

    Se llama antes de cada test: completar una quest muta el estado, y sin esto
    el resultado dependería del orden alfabético de los nombres.
    """
    st._mock = None


def test_las_rutas_no_dependen_del_cwd():
    """Lo que evita que la oficina salga vacía cuando el proceso no arranca
    desde la raíz del repo — que es justo lo que pasa en Render.

    Mientras el PR #2 siga abierto, `cerebro` resuelve estas rutas contra el CWD
    y `backend/__init__` las corrige desde afuera. Ya mergeado, el parche es
    redundante y esta aserción sigue guardando el invariante.
    """
    from cerebro import nucleo

    assert nucleo.DIR_EVENTOS.is_absolute(), nucleo.DIR_EVENTOS
    assert nucleo.FIXTURE_P2.is_absolute(), nucleo.FIXTURE_P2
    assert Path(os.environ["CEREBRO_CACHE_DIR"]).is_absolute()


def test_salud_responde():
    r = cliente.get("/salud")
    assert r.status_code == 200, r.text
    assert set(r.json()) == {"ok", "hay_api_key", "hay_supabase", "fuente_datos", "items", "forzar_mock"}


def test_los_7_escenarios_estan_en_la_consola():
    datos = cliente.get("/escenarios").json()
    assert len(datos) == 7, len(datos)
    con_objetivo = {e["id"] for e in datos if e["requiere_objetivo"]}
    assert con_objetivo == {"renuncia", "robo_pc"}, con_objetivo


def test_oficina_trae_los_9_con_riesgo():
    """Lo que P4 necesita para pintar la oficina: nombre, avatar y color."""
    datos = cliente.get("/oficina?mock=true").json()
    miembros = datos["miembros"]
    assert len(miembros) == 9, len(miembros)
    assert [m["score"] for m in miembros] == sorted((m["score"] for m in miembros), reverse=True)
    ana = miembros[0]
    assert ana["email"] == "ana@empresa.com" and ana["score"] == 100, ana
    assert ana["nombre"] and ana["sprite"] and ana["avatar_config"], ana
    assert len(ana["items_criticos"]) == 3, ana


def test_riesgo_separa_los_dos_numeros():
    """`score` es relativo (colores); `resiliencia_equipo` es el del pitch."""
    datos = cliente.get("/riesgo?mock=true").json()
    assert 0 < datos["resiliencia_equipo"] < 100, datos["resiliencia_equipo"]
    assert max(s["score"] for s in datos["scores"]) == 100


def test_conocimiento_filtra():
    todos = cliente.get("/conocimiento?mock=true").json()
    de_ana = cliente.get("/conocimiento?mock=true&persona=ana@empresa.com").json()
    accesos = cliente.get("/conocimiento?mock=true&tipo=acceso").json()
    criticos = cliente.get("/conocimiento?mock=true&solo_criticos=true").json()
    assert len(todos) == 10, len(todos)
    assert len(de_ana) == 3, len(de_ana)
    assert {i["tipo"] for i in accesos} == {"acceso"}
    assert all(not i["respaldos"] for i in criticos)


def test_conocimiento_por_persona_incluye_respaldos():
    """P5 pregunta 'qué sabe Samuel', no 'qué posee Samuel'."""
    de_samuel = cliente.get("/conocimiento?mock=true&persona=samuel@empresa.com").json()
    assert "ki-004" in {i["id"] for i in de_samuel}, de_samuel


def test_simular_renuncia_es_el_momento_del_demo():
    r = cliente.post("/simular?mock=true", json={"scenario_id": "renuncia", "objetivo_id": "ana@empresa.com"})
    assert r.status_code == 200, r.text
    sim = r.json()
    assert len(sim["items_huerfanos"]) == 3, sim["impacto"]
    assert sim["playbook_md"].strip().startswith("#")
    assert "LATAM" in sim["playbook_md"], "el playbook perdió el detalle que emociona"


def test_simular_sin_mock_funciona_con_la_base_vacia():
    """Si nadie corrió /admin/procesar, se cae a mock en vez de devolver vacío."""
    r = cliente.post("/simular", json={"scenario_id": "caida_github"})
    assert r.status_code == 200, r.text
    assert r.json()["playbook_md"].strip().startswith("#")


def test_escenario_invalido_es_422_no_500():
    r = cliente.post("/simular", json={"scenario_id": "meteorito"})
    assert r.status_code == 422, r.status_code
    r = cliente.post("/simular", json={"scenario_id": "renuncia"})
    assert r.status_code == 422, "renuncia sin objetivo debe ser error de quien llama"


def test_digest_trae_quests_y_puntos():
    datos = cliente.get("/digest?mock=true").json()
    assert len(datos["quests"]) == 5, len(datos["quests"])
    assert datos["puntos_disponibles"] > 0
    assert datos["puntos_ganados"] == 0


def test_completar_quest_sube_la_resiliencia():
    """Sin esto el momento demoable de P5 se cae: el número no se movería."""
    antes = cliente.get("/riesgo?mock=true").json()["resiliencia_equipo"]
    r = cliente.put("/quests/q-001?mock=true", json={"estado": "completada"})
    assert r.status_code == 200, r.text
    datos = r.json()
    assert datos["quest"]["estado"] == "completada"
    assert datos["delta"] > 0, datos
    assert datos["resiliencia_equipo"] > antes
    # El receptor sale del texto de la acción, que nombra a Camilo.
    assert datos["respaldo_email"] == "camilo@empresa.com", datos["respaldo_email"]
    assert "camilo@empresa.com" in datos["item"]["respaldos"]
    assert cliente.get("/digest?mock=true").json()["puntos_ganados"] == 30


def test_completar_quest_es_idempotente():
    """P5 va a hacer doble clic en el ensayo. No puede sumar dos respaldos."""
    cliente.put("/quests/q-003?mock=true", json={})
    primera = cliente.get("/riesgo?mock=true").json()["resiliencia_equipo"]
    segunda = cliente.put("/quests/q-003?mock=true", json={}).json()
    assert segunda["delta"] == 0.0, segunda
    assert segunda["resiliencia_equipo"] == primera


def test_respaldo_explicito_manda_sobre_el_texto():
    datos = cliente.put(
        "/quests/q-002?mock=true", json={"estado": "completada", "respaldo_email": "laura@empresa.com"}
    ).json()
    assert datos["respaldo_email"] == "laura@empresa.com"
    assert "laura@empresa.com" in datos["item"]["respaldos"]


def test_quest_inexistente_es_404():
    assert cliente.put("/quests/q-999?mock=true", json={}).status_code == 404


def test_procesar_corre_la_cadena_completa():
    """La Cita H3 en una petición. Sin API key el cerebro cae a mock solo."""
    r = cliente.post("/admin/procesar")
    assert r.status_code == 200, r.text
    datos = r.json()
    assert datos["eventos"] >= 40, datos
    assert datos["items"] > 0 and datos["personas"] > 0
    assert 0 < datos["resiliencia_equipo"] < 100
    assert cliente.get("/salud").json()["fuente_datos"] == "procesado"


def test_avatar_se_guarda_y_aparece_en_la_oficina():
    """P4 manda las capas en el root, sin token. Default: Ana."""
    r = cliente.put(
        "/avatar",
        json={"cuerpo": "light", "peinado": "long", "ropa": "shirt", "paleta": "blue"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["email"] == "ana@empresa.com"
    assert r.json()["avatar_config"]["peinado"] == "long"
    ana = next(m for m in cliente.get("/oficina?mock=true").json()["miembros"] if m["email"] == "ana@empresa.com")
    assert ana["avatar_config"]["paleta"] == "blue"


def test_conexion_simulada_no_pide_oauth():
    r = cliente.post("/conexiones", json={"tipo": "slack", "email": "david@empresa.com"})
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "activa"


# --- Conexiones de Slack ---------------------------------------------------------


def test_sin_credenciales_de_slack_el_error_dice_que_falta():
    """Un 500 opaco aquí cuesta media hora de depuración en el deploy."""
    with patch.dict("os.environ", {}, clear=False):
        for variable in SLACK_ENV:
            os.environ.pop(variable, None)
        with como() as cab:
            r = cliente.get("/conexiones/slack/iniciar", headers=cab)
    assert r.status_code == 503, r.status_code
    detalle = r.json()["detail"]
    assert "SLACK_CLIENT_ID" in detalle and "README" in detalle, detalle


def test_iniciar_arma_la_url_con_los_scopes_y_un_state():
    with con_slack(), como("david@empresa.com") as cab:
        datos = cliente.get("/conexiones/slack/iniciar", headers=cab).json()
    assert datos["url"].startswith("https://slack.com/oauth/v2/authorize?")
    for scope in ("channels%3Ahistory", "channels%3Aread", "users%3Aread", "users%3Aread.email"):
        assert scope in datos["url"], datos["url"]
    assert "state=" in datos["url"]
    assert SLACK_ENV["SLACK_CLIENT_SECRET"] not in datos["url"], "el secreto no va en la URL"


def test_iniciar_exige_bearer():
    with con_slack():
        assert cliente.get("/conexiones/slack/iniciar").status_code == 401


def test_el_state_va_firmado_y_no_se_deja_alterar():
    with con_slack():
        state = slack_oauth.firmar_state("ana@empresa.com")
        assert slack_oauth.email_del_state(state) == "ana@empresa.com"
        cuerpo, _, firma = state.partition(".")
        for falso in ("", "basura", cuerpo, f"{cuerpo}.{firma[:-2]}xx", f"otro.{firma}"):
            try:
                slack_oauth.email_del_state(falso)
            except Exception as e:
                assert getattr(e, "status_code", None) == 400, (falso, e)
            else:
                raise AssertionError(f"state falsificado aceptado: {falso!r}")


def test_el_state_vence():
    """Diez minutos: si el link queda en el historial, ya no sirve para nada."""
    with con_slack():
        with patch.object(slack_oauth.time, "time", return_value=1_000_000):
            viejo = slack_oauth.firmar_state("ana@empresa.com")
        with patch.object(slack_oauth.time, "time", return_value=1_000_000 + 601):
            try:
                slack_oauth.email_del_state(viejo)
            except Exception as e:
                assert getattr(e, "status_code", None) == 400, e
                assert "vencido" in str(e.detail), e.detail
            else:
                raise AssertionError("un state vencido siguió sirviendo")


def test_callback_con_state_invalido_no_conecta_nada():
    """Sin esto, cualquiera con el link del callback conecta su Slack a otra cuenta."""
    def jamas(*_a, **_k):
        raise AssertionError("se intentó canjear el código con un state que no verificamos")

    with con_slack(), supabase_falso() as conexiones, patch.object(slack_oauth, "canjear_codigo", jamas):
        r = cliente.get(
            "/conexiones/slack/callback",
            params={"code": "codigo-cualquiera", "state": "falsificado.xx"},
            follow_redirects=False,
        )
    assert r.status_code == 302, r.status_code
    assert "slack=error" in r.headers["location"], r.headers["location"]
    assert conexiones == [], "se guardó una conexión con un state que no emitimos"


def test_callback_sin_code_redirige_en_vez_de_reventar():
    """Aquí aterriza un navegador: un JSON de error sería una pantalla en blanco."""
    with con_slack():
        r = cliente.get("/conexiones/slack/callback", params={"error": "access_denied"}, follow_redirects=False)
    assert r.status_code == 302
    assert "slack=error" in r.headers["location"]
    assert "access_denied" in r.headers["location"]


def test_el_callback_guarda_el_token_y_no_lo_devuelve():
    """El camino feliz completo, con Slack simulado: canje, guardado y vuelta al
    frontend. Es el único sitio del sistema donde una credencial ajena aterriza."""

    class RespuestaSlack:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            return {
                "ok": True,
                "access_token": TOKEN_FALSO,
                "scope": slack_oauth.SCOPES,
                "team": {"id": "T123", "name": "Equipo Demo"},
            }

    with con_slack(), supabase_falso() as conexiones, patch.object(slack_oauth.httpx, "post", return_value=RespuestaSlack()):
        state = slack_oauth.firmar_state("david@empresa.com")
        r = cliente.get(
            "/conexiones/slack/callback",
            params={"code": "codigo-valido", "state": state},
            follow_redirects=False,
        )

    # `ok` y no `conectado`: el parser del frontend lee ok|true|1 como éxito y
    # cualquier otro valor como el motivo de un fallo.
    assert r.status_code == 302 and "slack=ok" in r.headers["location"], r.headers["location"]
    assert TOKEN_FALSO not in r.text and TOKEN_FALSO not in r.headers["location"]
    assert len(conexiones) == 1, conexiones
    guardada = conexiones[0]
    assert guardada["access_token"] == TOKEN_FALSO, "el token tiene que quedar guardado"
    assert guardada["team_id"] == "T123" and guardada["estado"] == "activa", guardada


def test_el_callback_vuelve_a_una_url_absoluta():
    """Render inyecta el host sin esquema; sin normalizarlo la redirección sería
    relativa y el usuario aterrizaría en la API en vez del frontend."""
    with con_slack(), patch.dict("os.environ", {"FRONTEND_URL": "bus-factor-web.onrender.com"}):
        r = cliente.get("/conexiones/slack/callback", params={"error": "denegado"}, follow_redirects=False)
    assert r.headers["location"].startswith("https://bus-factor-web.onrender.com/conexiones"), r.headers["location"]


def test_el_token_nunca_sale_por_la_api():
    """La regla que no se negocia: el estado se consulta, la credencial no."""
    fila = {
        "estado": "activa",
        "access_token": TOKEN_FALSO,
        "team_id": "T123",
        "team_nombre": "Equipo Demo",
        "scopes": slack_oauth.SCOPES,
        "actualizado_en": "2026-08-23T00:00:00Z",
    }
    with con_slack(), supabase_falso([fila]), como() as cab:
        respuestas = [
            cliente.get("/conexiones", headers=cab),
            cliente.get("/conexiones/slack/iniciar", headers=cab),
        ]
    for r in respuestas:
        assert r.status_code == 200, r.text
        assert TOKEN_FALSO not in r.text, r.text
        assert "access_token" not in r.text, r.text
    conexion = respuestas[0].json()["conexiones"][0]
    assert conexion["estado"] == "activa" and conexion["team_nombre"] == "Equipo Demo", conexion


def test_sin_conexion_no_se_lista_como_conectado():
    """El frontend lee cada fuente que le llega como activa: anunciar una
    conexión inexistente le haría decir que Slack está listo."""
    with con_slack(), supabase_falso([]), como() as cab:
        datos = cliente.get("/conexiones", headers=cab).json()
    assert datos["conexiones"] == [], datos


def test_sincronizar_sin_conexion_es_409_no_500():
    with con_slack(), supabase_falso([]), como() as cab:
        r = cliente.post("/conexiones/slack/sincronizar", headers=cab)
    assert r.status_code == 409, r.text
    assert TOKEN_FALSO not in r.text


def test_sincronizar_exige_bearer():
    assert cliente.post("/conexiones/slack/sincronizar").status_code == 401


def test_conexiones_lista_todas_las_fuentes():
    """Drive se marca con POST /conexiones. Si GET no lo devolviera, recargar la
    pantalla diría "sin conectar" con las transcripciones ya dentro."""
    filas = [
        {"tipo": "slack", "estado": "activa", "team_nombre": "Equipo Demo", "access_token": TOKEN_FALSO},
        {"tipo": "drive", "estado": "activa"},
    ]
    with con_slack(), supabase_falso(filas), como() as cab:
        r = cliente.get("/conexiones", headers=cab)
    assert {c["tipo"] for c in r.json()["conexiones"]} == {"slack", "drive"}, r.json()
    assert TOKEN_FALSO not in r.text and "access_token" not in r.text, r.text


# --- Transcripciones de Meet -----------------------------------------------------


def test_las_transcripciones_entran_como_eventos_de_meet():
    """El camino realista para Meet: el .txt exportado a mano, sin OAuth de Google."""
    archivo = st.archivo_de_eventos("of-demo")
    assert not archivo.exists(), "el test necesita el directorio limpio"
    try:
        with con_slack(), supabase_falso(), como() as cab:
            r = cliente.post(
                "/conexiones/drive/transcripciones",
                headers=cab,
                json={"archivos": [{"nombre": "reunion.txt", "contenido": "Ana explica el rollback. " * 20}]},
            )
        assert r.status_code == 200, r.text
        datos = r.json()
        assert datos["ok"] is True and datos["eventos"] >= 1, datos

        guardados = json.loads(archivo.read_text(encoding="utf-8"))
        assert {e["fuente"] for e in guardados} == {"meet"}, guardados
        assert all(e["autor_email"] == "ana@empresa.com" for e in guardados), guardados
    finally:
        archivo.unlink(missing_ok=True)
        st._eventos = None


def test_resubir_la_misma_transcripcion_no_duplica():
    """El id sale del contenido: el doble clic del ensayo no infla el mapa."""
    archivo = st.archivo_de_eventos("of-demo")
    cuerpo = {"archivos": [{"nombre": "reunion.txt", "contenido": "David tiene la llave del servidor."}]}
    try:
        with con_slack(), supabase_falso(), como() as cab:
            primera = cliente.post("/conexiones/drive/transcripciones", headers=cab, json=cuerpo).json()
            segunda = cliente.post("/conexiones/drive/transcripciones", headers=cab, json=cuerpo).json()
        assert segunda["total"] == primera["total"], (primera, segunda)
        assert segunda["nuevos"] == 0, segunda
    finally:
        archivo.unlink(missing_ok=True)
        st._eventos = None


def test_transcripciones_vacias_son_422_y_exigen_bearer():
    with con_slack(), supabase_falso(), como() as cab:
        assert cliente.post("/conexiones/drive/transcripciones", headers=cab, json={"archivos": []}).status_code == 422
        vacio = {"archivos": [{"nombre": "x.txt", "contenido": "   "}]}
        assert cliente.post("/conexiones/drive/transcripciones", headers=cab, json=vacio).status_code == 422
    assert cliente.post("/conexiones/drive/transcripciones", json={"archivos": []}).status_code == 401


# --- Eventos por HTTP ------------------------------------------------------------


def evento(id_: str, autor="ana@empresa.com", contenido="Yo tengo el acceso al CRM de producción.") -> dict:
    return {
        "id": id_,
        "fuente": "slack",
        "tipo": "mensaje",
        "autor_email": autor,
        "participantes": [],
        "timestamp": "2026-08-20T10:00:00Z",
        "contenido": contenido,
        "metadata": {"canal": "#general"},
    }


def test_admin_eventos_persiste_y_deduplica():
    """Lo que hace posible meter datos en Render sin volver a desplegar."""
    archivo = st.archivo_de_eventos("of-test")
    try:
        r = cliente.post("/admin/eventos?oficina=of-test", json=[evento("e-1"), evento("e-2")])
        assert r.status_code == 200, r.text
        assert r.json()["nuevos"] == 2 and r.json()["total"] == 2, r.json()

        repetido = cliente.post("/admin/eventos?oficina=of-test", json=[evento("e-2"), evento("e-3")]).json()
        assert repetido["nuevos"] == 1 and repetido["total"] == 3, repetido

        guardados = json.loads(archivo.read_text(encoding="utf-8"))
        assert [e["id"] for e in guardados] == ["e-1", "e-2", "e-3"], guardados
    finally:
        archivo.unlink(missing_ok=True)
        st._eventos = None


def test_admin_eventos_valida_el_contrato():
    """El body es la frontera: un evento inválido es 422, no un archivo corrupto."""
    archivo = st.archivo_de_eventos("of-test")
    try:
        assert cliente.post("/admin/eventos?oficina=of-test", json=[]).status_code == 422
        malo = {**evento("e-x"), "fuente": "telegram"}
        assert cliente.post("/admin/eventos?oficina=of-test", json=[malo]).status_code == 422
        assert not archivo.exists(), "un lote inválido no puede dejar rastro en disco"
    finally:
        archivo.unlink(missing_ok=True)
        st._eventos = None


def test_admin_eventos_se_puede_cerrar_con_token():
    """Es el endpoint que inyecta el conocimiento que luego se atribuye a gente
    real. Abierto por defecto (como el resto de /admin), cerrable en Render."""
    archivo = st.archivo_de_eventos("of-test")
    try:
        with patch.dict("os.environ", {"ADMIN_TOKEN": "secreto"}):
            sin = cliente.post("/admin/eventos?oficina=of-test", json=[evento("e-1")])
            con = cliente.post(
                "/admin/eventos?oficina=of-test",
                json=[evento("e-1")],
                headers={"X-Admin-Token": "secreto"},
            )
        assert sin.status_code == 401, sin.text
        assert con.status_code == 200, con.text
    finally:
        archivo.unlink(missing_ok=True)
        st._eventos = None


def test_los_eventos_ingeridos_llegan_al_pipeline():
    """`procesar()` lee del disco: si lo que entra por HTTP no aterriza ahí, el
    endpoint sería decorativo."""
    archivo = st.archivo_de_eventos("of-demo")
    assert not archivo.exists(), "el test necesita el directorio limpio"
    try:
        cliente.post("/admin/eventos", json=[evento("e-pipeline")])
        st._eventos = None
        ids = {e.id for e in st.eventos()}
        assert "e-pipeline" in ids, "el evento no llegó a cargar_eventos()"
        assert not any(e.id.startswith("ev-") for e in st.eventos()), (
            "con datos vivos el fixture no debe seguir contando"
        )
    finally:
        archivo.unlink(missing_ok=True)
        st._eventos = None


if __name__ == "__main__":
    fallos = 0
    for nombre, fn in sorted(globals().items()):
        if not nombre.startswith("test_"):
            continue
        try:
            mock_limpio()
            fn()
            print(f"ok   {nombre}")
        except AssertionError as e:
            fallos += 1
            print(f"FALLA {nombre}: {e}")
    print(f"\n{fallos} fallo(s)")
    raise SystemExit(1 if fallos else 0)
