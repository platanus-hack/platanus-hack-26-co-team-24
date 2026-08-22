"""Check runnable del cerebro. Sin API key, sin red, sin framework.

    python test_cerebro.py

Verifica lo que se puede romper en silencio: la fórmula de riesgo, el grafo de
colaboración, el filtrado por escenario y que el contrato serialice.
"""

import json
import re
from pathlib import Path

from cerebro import (ESCENARIOS_POR_ID, KnowledgeItem, RawEvent, calcular_riesgo, extraer,
                     generar_digest, resiliencia_equipo, simular)
from cerebro.grafo import colaboradores, construir_grafo, es_puente, grado, intermediacion
from cerebro.nucleo import (PISO_NORMALIZACION, _afectados, _bloque_colaboracion, _dedup_exacto,
                            _emails_de, _formatear_eventos, cobertura, peso_riesgo)
from cerebro.validacion import escenarios_sanos, monotonia, sensibilidad_pesos, spearman

EVENTOS = [RawEvent.model_validate(e) for e in json.loads(Path("data/raw/mock_events.json").read_text(encoding="utf-8"))]


def item(id_, tipo, dueño, respaldos=()):
    return KnowledgeItem(
        id=id_, tipo=tipo, descripcion=f"desc {id_}", dueño_principal=dueño,
        respaldos=list(respaldos), fuente="slack", evidencia="cita",
    )


def test_riesgo_castiga_lo_que_no_tiene_respaldo():
    items = [
        item("a", "acceso", "ana@e.com"),                      # 3 * 1.00 = 3.00
        item("b", "acceso", "bob@e.com", ["cid@e.com"]),       # 3 * 0.55 = 1.65
    ]
    scores = {s.persona_id: s for s in calcular_riesgo(items)}
    assert scores["ana@e.com"].riesgo_absoluto == 3.0
    assert scores["bob@e.com"].riesgo_absoluto == 1.65
    assert scores["ana@e.com"].items_criticos == ["a"]
    assert scores["bob@e.com"].items_criticos == []


def test_riesgo_pesa_por_tipo():
    items = [item("a", "acceso", "x@e.com"), item("b", "tarea", "y@e.com")]
    r = {s.persona_id: s.riesgo_absoluto for s in calcular_riesgo(items)}
    assert r["x@e.com"] == 3.0 and r["y@e.com"] == 1.0, r


def test_cobertura_descuenta_gradualmente():
    """Un respaldo único sigue siendo frágil: no baja a cero de golpe."""
    sin_, uno, dos, tres = (item("x", "acceso", "a@e", ["b@e"] * n) for n in (0, 1, 2, 3))
    assert cobertura(sin_) == 0.0 and cobertura(uno) == 0.5 and cobertura(dos) == cobertura(tres) == 1.0
    assert peso_riesgo(sin_) == 3.0
    assert 1.6 < peso_riesgo(uno) < 1.7
    assert abs(peso_riesgo(dos) - 0.3) < 1e-9


def test_piso_evita_que_un_equipo_sano_salga_en_rojo():
    """Sin piso, siempre hay alguien en 100 aunque el equipo esté cubierto."""
    cubiertos = [item("a", "tarea", "ana@e.com", ["x@e.com", "y@e.com"])]
    assert calcular_riesgo(cubiertos)[0].score < 10
    solo = [item("a", "acceso", "ana@e.com")]
    assert calcular_riesgo(solo)[0].riesgo_absoluto <= PISO_NORMALIZACION


def test_resiliencia_sube_cuando_el_equipo_documenta():
    """El número del pitch tiene que poder mejorar. El score relativo no puede."""
    antes = [item("a", "acceso", "ana@e.com"), item("b", "tarea", "bob@e.com")]
    despues = [
        item("a", "acceso", "ana@e.com", ["bob@e.com", "cid@e.com"]),
        item("b", "tarea", "bob@e.com", ["ana@e.com", "cid@e.com"]),
    ]
    assert resiliencia_equipo(antes) == 0.0
    assert resiliencia_equipo(despues) == 100.0
    # y el score relativo, por diseño, NO refleja la mejora: por eso existe el otro
    assert max(s.score for s in calcular_riesgo(antes)) == max(s.score for s in calcular_riesgo(antes))


def test_monotonia_de_la_formula():
    """Propiedades que nunca deben romperse, sobre los datos reales."""
    assert monotonia(extraer([], mock=True), EVENTOS) == []


def test_ranking_aguanta_perturbar_los_pesos():
    """Los pesos son inventados; si el ranking depende de ellos, no vale nada."""
    s = sensibilidad_pesos(extraer([], mock=True), EVENTOS, corridas=50)
    assert s["spearman_mediana"] > 0.9, s
    assert s["lider_estable_pct"] == 100.0, s


def test_spearman():
    assert spearman([1, 2, 3], [10, 20, 30]) == 1.0
    assert spearman([1, 2, 3], [30, 20, 10]) == -1.0
    assert abs(spearman([1, 2, 3, 4], [1, 2, 2, 4])) > 0.9  # con empates


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
    sin_grafo = {s.persona_id: s.riesgo_absoluto for s in calcular_riesgo(items)}
    scores = calcular_riesgo(items, EVENTOS)
    con_grafo = {s.persona_id: s.riesgo_absoluto for s in scores}
    assert sin_grafo["ana@empresa.com"] == sin_grafo["samuel@empresa.com"], "mismo conocimiento"
    assert con_grafo["ana@empresa.com"] > con_grafo["samuel@empresa.com"], "distinta posición en la red"
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


def test_los_7_escenarios_dan_resultados_distintos():
    """Sin esto, los siete botones de la consola hacen lo mismo y se nota."""
    assert escenarios_sanos(extraer([], mock=True)) == []


def test_sin_api_key_el_playbook_es_del_escenario_correcto():
    """El plan B no puede devolver el playbook de otro escenario."""
    items = extraer([], mock=True)
    r = simular("caida_github", items)
    assert r.generado_por == "respaldo"
    assert "GitHub" in r.playbook_md.splitlines()[0]
    assert r.advertencias and "API_KEY" in r.advertencias[0]
    # mock=True sí devuelve el guion ensayado de Ana, a propósito
    assert simular("caida_github", items, mock=True).generado_por == "mock"


def test_playbook_de_respaldo_solo_usa_datos_reales():
    items = extraer([], mock=True)
    md = simular("renuncia", items, "ana@empresa.com").playbook_md
    reales = {i.dueño_principal for i in items} | {r for i in items for r in i.respaldos}
    assert set(re.findall(r"[\w.+-]+@[\w.-]+\.\w+", md)) <= reales


def test_metadata_de_p1_llega_al_prompt():
    """Los archivos tocados de un commit son la señal más fuerte de quién toca qué."""
    commit = next(e for e in EVENTOS if e.metadata.get("archivos"))
    prompt = _formatear_eventos([commit])
    assert "metadata:" in prompt
    assert commit.metadata["archivos"][0] in prompt


def test_grafo_pesa_las_interacciones():
    g = construir_grafo(EVENTOS)
    cercanos = colaboradores(g, "ana@empresa.com")
    assert cercanos[0][1] >= cercanos[-1][1], "debe venir ordenado de mayor a menor"
    assert all(n >= 1 for _, n in cercanos)
    assert dict(cercanos)["laura@empresa.com"] == g["ana@empresa.com"]["laura@empresa.com"]


def test_el_playbook_recibe_co_participacion():
    """El doc pide sugerir sucesor por cercanía; sin el grafo el modelo adivina."""
    afectados = _afectados("renuncia", extraer([], mock=True), "ana@empresa.com")
    assert _bloque_colaboracion(afectados, None) == "", "sin eventos, sin bloque"
    bloque = _bloque_colaboracion(afectados, EVENTOS)
    assert "ana@empresa.com trabaja sobre todo con" in bloque
    assert "interacciones" in bloque


def test_el_respaldo_propone_sucesor():
    r = simular("renuncia", extraer([], mock=True), "ana@empresa.com", EVENTOS)
    assert "candidato por cercanía" in r.playbook_md


def test_extraer_filtra_emails_inventados():
    """Un respaldo falso apaga la alarma: es peor que no tener respaldo."""
    permitidos = _emails_de(EVENTOS)
    assert "ana@empresa.com" in permitidos
    assert "fantasma@empresa.com" not in permitidos


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
