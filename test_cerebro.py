"""Check runnable del cerebro. Sin API key, sin red, sin framework.

    python test_cerebro.py

Verifica lo que se puede romper en silencio: la fórmula de riesgo, el grafo de
colaboración, el filtrado por escenario y que el contrato serialice.
"""

import json
from pathlib import Path

from cerebro import ESCENARIOS_POR_ID, KnowledgeItem, RawEvent, calcular_riesgo, extraer, generar_digest, simular
from cerebro.grafo import construir_grafo, es_puente, grado, intermediacion
from cerebro.nucleo import _afectados, _dedup_exacto

EVENTOS = [RawEvent.model_validate(e) for e in json.loads(Path("data/raw/mock_events.json").read_text(encoding="utf-8"))]


def item(id_, tipo, dueño, respaldos=()):
    return KnowledgeItem(
        id=id_, tipo=tipo, descripcion=f"desc {id_}", dueño_principal=dueño,
        respaldos=list(respaldos), fuente="slack", evidencia="cita",
    )


def test_riesgo_castiga_lo_que_no_tiene_respaldo():
    items = [
        item("a", "acceso", "ana@e.com"),                      # 3 * 2 = 6
        item("b", "acceso", "bob@e.com", ["cid@e.com"]),       # 3
    ]
    scores = {s.persona_id: s for s in calcular_riesgo(items)}
    assert scores["ana@e.com"].score == 100, scores["ana@e.com"]
    assert scores["bob@e.com"].score == 50, scores["bob@e.com"]
    assert scores["ana@e.com"].items_criticos == ["a"]
    assert scores["bob@e.com"].items_criticos == []


def test_riesgo_pesa_por_tipo():
    items = [item("a", "acceso", "x@e.com", ["z@e.com"]), item("b", "tarea", "y@e.com", ["z@e.com"])]
    scores = {s.persona_id: s.score for s in calcular_riesgo(items)}
    assert scores["x@e.com"] == 100 and scores["y@e.com"] == 33, scores


def test_grafo_detecta_puentes_y_islas():
    """Grafo en forma de pesa: b es el único puente entre las dos mitades."""
    eventos = [
        RawEvent(id=f"e{i}", fuente="slack", tipo="mensaje", autor_email=x,
                 participantes=[y], timestamp="2026-01-01T00:00:00Z", contenido="x")
        for i, (x, y) in enumerate([("a@e", "b@e"), ("b@e", "c@e"), ("c@e", "d@e"), ("d@e", "c@e")])
    ]
    g = construir_grafo(eventos)
    puentes = es_puente(g)
    assert puentes["b@e"] and puentes["c@e"]
    assert not puentes["a@e"] and not puentes["d@e"]
    assert grado(g) == {"a@e": 1, "b@e": 2, "c@e": 2, "d@e": 1}


def test_intermediacion_premia_al_conector():
    """Estrella: el centro está en todos los caminos; las hojas en ninguno."""
    eventos = [
        RawEvent(id=f"e{i}", fuente="slack", tipo="mensaje", autor_email="centro@e",
                 participantes=[hoja], timestamp="2026-01-01T00:00:00Z", contenido="x")
        for i, hoja in enumerate(["h1@e", "h2@e", "h3@e"])
    ]
    bc = intermediacion(construir_grafo(eventos))
    assert bc["centro@e"] == 1.0
    assert all(bc[h] == 0.0 for h in ["h1@e", "h2@e", "h3@e"])


def test_intermediacion_sube_el_score():
    """Ana tiene la intermediación más alta del equipo: mismo conocimiento, más riesgo."""
    items = [item("a", "tarea", "ana@empresa.com"), item("b", "tarea", "samuel@empresa.com")]
    sin_grafo = {s.persona_id: s.score for s in calcular_riesgo(items)}
    scores = calcular_riesgo(items, EVENTOS)
    con_grafo = {s.persona_id: s.score for s in scores}
    assert sin_grafo["ana@empresa.com"] == sin_grafo["samuel@empresa.com"] == 100
    assert con_grafo["ana@empresa.com"] > con_grafo["samuel@empresa.com"]
    assert "intermediación" in next(s for s in scores if s.persona_id == "ana@empresa.com").detalle


def test_escenarios_filtran_distinto():
    items = [
        item("a", "acceso", "ana@e.com"),
        item("b", "tarea", "ana@e.com"),
        item("c", "acceso", "bob@e.com"),
    ]
    assert {i.id for i in _afectados("renuncia", items, "ana@e.com")} == {"a", "b"}
    assert {i.id for i in _afectados("robo_pc", items, "ana@e.com")} == {"a"}
    assert {i.id for i in _afectados("ransomware", items, None)} == {"a", "c"}


def test_dedup_une_respaldos():
    a = item("mismo", "tarea", "ana@e.com", ["x@e.com"])
    b = item("mismo", "tarea", "ana@e.com", ["y@e.com"])
    (unido,) = _dedup_exacto([a, b])
    assert unido.respaldos == ["x@e.com", "y@e.com"]


def test_simular_valida_entrada():
    for malo, esperado in [(("no_existe", None), "desconocido"), (("renuncia", None), "requiere un objetivo_id")]:
        try:
            simular(malo[0], list(_MOCK_ITEMS), malo[1])
        except ValueError as e:
            assert esperado in str(e), e
        else:
            raise AssertionError(f"debió fallar: {malo}")


def test_contrato_serializa():
    """Lo que P3 va a mandar por HTTP tiene que ser JSON válido."""
    items = extraer(EVENTOS, mock=True)
    scores = calcular_riesgo(items, EVENTOS)
    sim = simular("renuncia", items, "ana@empresa.com", mock=True)
    quests = generar_digest(items, scores, mock=True)
    for obj in [*items, *scores, sim, *quests]:
        json.loads(obj.model_dump_json())
    assert "dueño_principal" in items[0].model_dump()
    assert sim.playbook_md.strip().startswith("#")
    assert len(ESCENARIOS_POR_ID) == 7


_MOCK_ITEMS = extraer([], mock=True)


if __name__ == "__main__":
    fallos = 0
    for nombre, fn in sorted(globals().items()):
        if not nombre.startswith("test_"):
            continue
        try:
            fn()
            print(f"ok   {nombre}")
        except AssertionError as e:
            fallos += 1
            print(f"FALLA {nombre}: {e}")
    print(f"\n{fallos} fallo(s)")
    raise SystemExit(1 if fallos else 0)
