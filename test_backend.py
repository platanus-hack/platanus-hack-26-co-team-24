"""Check runnable de la API. Sin API key, sin red, sin framework de tests.

    python test_backend.py

Cubre lo que rompe el demo en silencio: que el contrato que consumen P4 y P5 no
cambie de forma, que `?mock=true` funcione con la base vacía, y que completar
una quest mueva de verdad el puntaje del equipo.
"""

from fastapi.testclient import TestClient

from backend import estado as st
from backend.app import app

cliente = TestClient(app)


def mock_limpio():
    """Vuelve el estado mock a su punto de partida sin tocar el disco.

    Se llama antes de cada test: completar una quest muta el estado, y sin esto
    el resultado dependería del orden alfabético de los nombres.
    """
    st._mock = None


def test_salud_responde():
    r = cliente.get("/salud")
    assert r.status_code == 200, r.text
    assert set(r.json()) == {"ok", "hay_api_key", "fuente_datos", "items", "forzar_mock"}


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
