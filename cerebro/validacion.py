"""Arnés de validación del cerebro.

    python -m cerebro.validacion

El problema de fondo: no existe una verdad de referencia sobre "quién es el
punto único de falla". Así que en vez de una métrica, seis comprobaciones que
atacan el problema por ángulos distintos. Ninguna basta sola; juntas dicen si el
sistema está funcionando.

1. Anti-alucinación   ¿inventó personas que no existen en los eventos?
2. Evidencia          ¿las citas son textuales o se las inventó?
3. Casos sembrados    ¿encontró lo que sabemos que está ahí? (precisión/recall)
4. Escenarios         ¿los 7 corren y dan resultados distintos entre sí?
5. Monotonía          ¿la fórmula se comporta como promete?
6. Sensibilidad       ¿el ranking sobrevive si muevo los pesos inventados?
7. Ranking humano     ¿coincide con lo que el equipo cree? (correlación de Spearman)

Las 1-6 corren sin red. La 6 necesita `data/ranking_humano.json`, que se llena
con una encuesta de cinco minutos al equipo.
"""

from __future__ import annotations

import json
import random
import re
import unicodedata
from pathlib import Path

from .esquemas import KnowledgeItem, RawEvent, RiskScore
from .nucleo import PESOS, calcular_riesgo, peso_riesgo

RUTA_RANKING_HUMANO = Path("data/ranking_humano.json")

# Lo que sabemos que está sembrado en data/raw/mock_events.json. Es el gold set:
# si P1 cambia los datos, esta lista se actualiza con él.
CASOS_SEMBRADOS = [
    {"nombre": "regla de LATAM", "palabras": ["latam"], "dueño": "ana@empresa.com", "tipo": "regla_tacita", "critico": True},
    {"nombre": "admin del CRM", "palabras": ["crm"], "dueño": "ana@empresa.com", "tipo": "acceso", "critico": True},
    {"nombre": "tiquetes de la gerencia", "palabras": ["vuelo", "viaj", "tiquete", "reserva"], "dueño": "ana@empresa.com", "tipo": "tarea", "critico": True},
    {"nombre": "rollback / despliegue", "palabras": ["rollback", "despliegue", "deploy"], "dueño": "david@empresa.com", "tipo": "proceso", "critico": True},
    {"nombre": "acceso SSH a producción", "palabras": ["ssh", "servidor"], "dueño": "david@empresa.com", "tipo": "acceso", "critico": False},
    {"nombre": "pipeline de reportes", "palabras": ["pipeline", "reporte"], "dueño": "jorge@empresa.com", "tipo": "tarea", "critico": True},
    {"nombre": "soporte en horario extendido", "palabras": ["soporte"], "dueño": "valentina@empresa.com", "tipo": "proceso", "critico": True},
    {"nombre": "admin de Google Workspace", "palabras": ["workspace", "google"], "dueño": "brayan@empresa.com", "tipo": "acceso", "critico": False},
    {"nombre": "review obligatorio de plataforma", "palabras": ["review", "main", "mergea"], "dueño": "andres@empresa.com", "tipo": "regla_tacita", "critico": False},
    {"nombre": "conciliación de facturación", "palabras": ["concilia", "facturaci"], "dueño": "laura@empresa.com", "tipo": "proceso", "critico": False},
]


# --- utilidades -----------------------------------------------------------------


def _normalizar(texto: str) -> str:
    sin_tildes = "".join(c for c in unicodedata.normalize("NFD", texto.lower()) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9 ]+", " ", sin_tildes)


def _palabras(texto: str) -> set[str]:
    return {p for p in _normalizar(texto).split() if len(p) > 3}


def _rangos(valores: list[float]) -> list[float]:
    """Rangos con promedio en los empates."""
    orden = sorted(range(len(valores)), key=lambda i: valores[i])
    rangos = [0.0] * len(valores)
    i = 0
    while i < len(orden):
        j = i
        while j + 1 < len(orden) and valores[orden[j + 1]] == valores[orden[i]]:
            j += 1
        promedio = (i + j) / 2 + 1
        for k in range(i, j + 1):
            rangos[orden[k]] = promedio
        i = j + 1
    return rangos


def spearman(a: list[float], b: list[float]) -> float:
    """Correlación de rangos. 1 = mismo orden, -1 = orden inverso, 0 = sin relación."""
    if len(a) != len(b) or len(a) < 2:
        return 0.0
    ra, rb = _rangos(a), _rangos(b)
    n = len(a)
    ma, mb = sum(ra) / n, sum(rb) / n
    num = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    den = (sum((x - ma) ** 2 for x in ra) * sum((y - mb) ** 2 for y in rb)) ** 0.5
    return num / den if den else 0.0


# --- 1. Anti-alucinación --------------------------------------------------------


def emails_inventados(items: list[KnowledgeItem], eventos: list[RawEvent]) -> list[str]:
    """Emails atribuidos por el LLM que no aparecen en ningún evento.

    Es el fallo más caro: un playbook que reparte trabajo a alguien que no existe
    destruye la credibilidad del demo en un segundo.
    """
    reales = {e.autor_email for e in eventos} | {p for e in eventos for p in e.participantes}
    reales |= {p for e in eventos for p in re.findall(r"[\w.+-]+@[\w.-]+", e.contenido)}
    fallos = []
    for it in items:
        for email in [it.dueño_principal, *it.respaldos]:
            if email not in reales:
                fallos.append(f"{it.id}: '{email}' no aparece en ningún evento ({it.descripcion[:50]})")
    return fallos


def evidencia_no_rastreable(items: list[KnowledgeItem], eventos: list[RawEvent], umbral: float = 0.6) -> list[str]:
    """Items cuya `evidencia` no se solapa con el texto de ningún evento.

    Detecta citas parafraseadas o inventadas. El umbral es de solapamiento de
    palabras, no de subcadena exacta: el LLM suele recortar y limpiar la cita.
    """
    corpus = [_palabras(e.contenido) for e in eventos]
    fallos = []
    for it in items:
        cita = _palabras(it.evidencia)
        if not cita:
            fallos.append(f"{it.id}: evidencia vacía")
            continue
        mejor = max((len(cita & c) / len(cita) for c in corpus), default=0.0)
        if mejor < umbral:
            fallos.append(f"{it.id}: evidencia solapa {mejor:.0%} con el mejor evento — «{it.evidencia[:60]}»")
    return fallos


def evento_ids_validos(items: list[KnowledgeItem], eventos: list[RawEvent]) -> list[str]:
    conocidos = {e.id for e in eventos}
    return [
        f"{it.id}: evento_id inexistente '{eid}'"
        for it in items
        for eid in it.evento_ids
        if eid not in conocidos
    ]


# --- 2. Casos sembrados (gold set) ----------------------------------------------


def cobertura_casos(items: list[KnowledgeItem]) -> tuple[list[str], list[str]]:
    """Precisión sobre los casos que sabemos que están en los datos.

    Devuelve (aciertos, fallos). Un caso acierta si algún item lo menciona, con
    el dueño correcto y la criticidad correcta.
    """
    aciertos, fallos = [], []
    for caso in CASOS_SEMBRADOS:
        candidatos = [
            it for it in items
            if any(p in _normalizar(it.descripcion + " " + it.evidencia) for p in caso["palabras"])
        ]
        if not candidatos:
            fallos.append(f"NO ENCONTRADO  {caso['nombre']}")
            continue
        exacto = [it for it in candidatos if it.dueño_principal == caso["dueño"]]
        if not exacto:
            fallos.append(f"DUEÑO ERRADO   {caso['nombre']}: esperaba {caso['dueño']}, obtuve {candidatos[0].dueño_principal}")
            continue
        it = exacto[0]
        problemas = []
        if it.tipo != caso["tipo"]:
            problemas.append(f"tipo {it.tipo} (esperaba {caso['tipo']})")
        if it.es_critico != caso["critico"]:
            problemas.append(f"crítico={it.es_critico} (esperaba {caso['critico']})")
        if problemas:
            fallos.append(f"PARCIAL        {caso['nombre']}: " + ", ".join(problemas))
        else:
            aciertos.append(caso["nombre"])
    return aciertos, fallos


def escenarios_sanos(items: list[KnowledgeItem]) -> list[str]:
    """Los 7 escenarios corren, devuelven cosas distintas y no inventan gente.

    "Simular 3 escenarios sin que el JSON se rompa nunca" es un ítem del
    checklist de P2; esto lo cubre para los 7.
    """
    from .esquemas import ESCENARIOS
    from .nucleo import simular

    fallos, firmas = [], {}
    ids_validos = {i.id for i in items}
    for esc in ESCENARIOS:
        objetivo = "ana@empresa.com" if esc.requiere_objetivo else None
        try:
            r = simular(esc.id, items, objetivo)
        except Exception as e:
            fallos.append(f"{esc.id}: levantó {type(e).__name__}: {e}")
            continue
        if r.scenario_id != esc.id:
            fallos.append(f"{esc.id}: devolvió scenario_id={r.scenario_id}")
        if not r.playbook_md.strip().startswith("#"):
            fallos.append(f"{esc.id}: el playbook no empieza con encabezado Markdown")
        if huerfanos_raros := [i.id for i in r.items_huerfanos if i.id not in ids_validos]:
            fallos.append(f"{esc.id}: huérfanos que no están en el catálogo: {huerfanos_raros}")
        if inventados := [a for a in r.advertencias if "inventado" in a]:
            fallos.extend(f"{esc.id}: {a}" for a in inventados)
        firmas.setdefault(frozenset(i.id for i in r.items_huerfanos), []).append(esc.id)

    for firma, ids in firmas.items():
        if len(ids) > 1 and firma:
            fallos.append(f"escenarios indistinguibles (mismos huérfanos): {ids}")
    return fallos


# --- 3. Monotonía: la fórmula tiene que cumplir lo que promete ------------------


def monotonia(items: list[KnowledgeItem], eventos: list[RawEvent]) -> list[str]:
    """Propiedades que la fórmula NUNCA debe violar, pase lo que pase.

    - Añadir un respaldo a un item baja (o deja igual) el riesgo de su dueño.
    - Añadir un item sin respaldo sube el riesgo de su dueño.
    - Completar todas las quests posibles sube la resiliencia del equipo.
    """
    from .nucleo import resiliencia_equipo

    fallos = []
    base = {s.persona_id: s.riesgo_absoluto for s in calcular_riesgo(items, eventos)}

    for it in items:
        if len(it.respaldos) >= 2:
            continue
        copia = [x.model_copy(deep=True) for x in items]
        objetivo = next(x for x in copia if x.id == it.id)
        objetivo.respaldos = sorted(set(objetivo.respaldos) | {"nuevo_respaldo@empresa.com"})
        nuevo = {s.persona_id: s.riesgo_absoluto for s in calcular_riesgo(copia, eventos)}
        if nuevo[it.dueño_principal] > base[it.dueño_principal] + 1e-9:
            fallos.append(f"añadir respaldo a {it.id} SUBIÓ el riesgo de {it.dueño_principal}")

    victima = items[0].dueño_principal
    extra = items[0].model_copy(deep=True, update={"id": "ki-sintetico", "respaldos": [], "tipo": "acceso"})
    con_extra = {s.persona_id: s.riesgo_absoluto for s in calcular_riesgo([*items, extra], eventos)}
    if con_extra[victima] <= base[victima]:
        fallos.append(f"añadir un acceso sin respaldo a {victima} NO subió su riesgo")

    todos_cubiertos = [
        x.model_copy(deep=True, update={"respaldos": ["a@empresa.com", "b@empresa.com"]}) for x in items
    ]
    if resiliencia_equipo(todos_cubiertos) <= resiliencia_equipo(items):
        fallos.append("cubrir todo el conocimiento NO subió la resiliencia del equipo")
    return fallos


# --- 4. Sensibilidad: ¿los pesos inventados están decidiendo el resultado? -------


def sensibilidad_pesos(
    items: list[KnowledgeItem],
    eventos: list[RawEvent],
    *,
    corridas: int = 200,
    perturbacion: float = 0.5,
    semilla: int = 42,
) -> dict[str, float]:
    """Mueve los pesos ±50% al azar y mide cuánto cambia el ranking.

    Los pesos {acceso:3, proceso:2, regla_tacita:2, tarea:1} son una decisión de
    diseño, no un dato. Si el ranking aguanta perturbarlos, la conclusión sale de
    la evidencia; si se desarma, la sacaron los números inventados.

    Devuelve la correlación de Spearman contra el ranking base: mediana, mínimo,
    y con qué frecuencia se conserva quién va primero.
    """
    aleatorio = random.Random(semilla)
    base = calcular_riesgo(items, eventos)
    personas = [s.persona_id for s in base]
    valores_base = [s.riesgo_absoluto for s in base]
    lider_base = personas[0]

    rhos, lider_estable = [], 0
    for _ in range(corridas):
        pesos = {k: v * aleatorio.uniform(1 - perturbacion, 1 + perturbacion) for k, v in PESOS.items()}
        perturbado = {s.persona_id: s.riesgo_absoluto for s in calcular_riesgo(items, eventos, pesos=pesos)}
        rhos.append(spearman(valores_base, [perturbado[p] for p in personas]))
        if max(perturbado, key=lambda p: perturbado[p]) == lider_base:
            lider_estable += 1

    rhos.sort()
    return {
        "spearman_mediana": round(rhos[len(rhos) // 2], 3),
        "spearman_minimo": round(rhos[0], 3),
        "lider_estable_pct": round(100 * lider_estable / corridas, 1),
    }


# --- 5. Contraste con el juicio del equipo --------------------------------------


def vs_ranking_humano(scores: list[RiskScore], ruta: Path = RUTA_RANKING_HUMANO) -> dict | None:
    """Correlación de Spearman contra el orden que el equipo declaró.

    El JSON es `{"email": posición}` con 1 = la persona más crítica. Se llena
    preguntándole a cada quien, por separado: "si mañana no llega X, ¿qué se
    rompe? Ordena a las 9 personas". Cinco minutos y es la única verdad de
    referencia real que vamos a tener.
    """
    if not ruta.exists():
        return None
    humano: dict[str, int] = json.loads(ruta.read_text(encoding="utf-8"))
    comunes = [s for s in scores if s.persona_id in humano]
    if len(comunes) < 3:
        return {"error": f"solo {len(comunes)} personas en común con {ruta}"}
    # posición 1 = más crítico, así que se invierte para que ambos crezcan igual
    rho = spearman([s.riesgo_absoluto for s in comunes], [-humano[s.persona_id] for s in comunes])
    orden_sistema = [s.persona_id for s in sorted(comunes, key=lambda s: -s.riesgo_absoluto)]
    orden_humano = sorted([s.persona_id for s in comunes], key=lambda p: humano[p])
    return {
        "spearman": round(rho, 3),
        "n": len(comunes),
        "coincide_el_primero": orden_sistema[0] == orden_humano[0],
        "sistema": orden_sistema,
        "humanos": orden_humano,
    }


# --- Reporte --------------------------------------------------------------------


def reporte(items: list[KnowledgeItem], eventos: list[RawEvent]) -> int:
    """Imprime el informe completo. Devuelve el número de problemas graves."""
    from .nucleo import resiliencia_equipo

    graves = 0
    scores = calcular_riesgo(items, eventos)

    print(f"\n{len(items)} elementos de conocimiento · {len(eventos)} eventos · "
          f"resiliencia del equipo {resiliencia_equipo(items):.1f}/100\n")

    print("── 1. Anti-alucinación ──")
    for nombre, fallos in [
        ("emails inventados", emails_inventados(items, eventos)),
        ("evidencia no rastreable", evidencia_no_rastreable(items, eventos)),
        ("evento_ids inválidos", evento_ids_validos(items, eventos)),
    ]:
        if fallos:
            graves += len(fallos)
            print(f"  ✗ {nombre}: {len(fallos)}")
            for f in fallos[:5]:
                print(f"      {f}")
        else:
            print(f"  ✓ {nombre}")

    print("\n── 2. Casos sembrados (gold set) ──")
    aciertos, fallos = cobertura_casos(items)
    total = len(CASOS_SEMBRADOS)
    print(f"  {len(aciertos)}/{total} exactos ({100*len(aciertos)//total}%)")
    for f in fallos:
        print(f"      {f}")
    graves += sum(1 for f in fallos if f.startswith(("NO ENCONTRADO", "DUEÑO ERRADO")))

    print("\n── 3. Los 7 escenarios ──")
    fallos = escenarios_sanos(items)
    if fallos:
        graves += len(fallos)
        for f in fallos:
            print(f"  ✗ {f}")
    else:
        print("  ✓ los 7 corren, dan resultados distintos y no inventan personas")

    print("\n── 4. Monotonía de la fórmula ──")
    fallos = monotonia(items, eventos)
    if fallos:
        graves += len(fallos)
        for f in fallos:
            print(f"  ✗ {f}")
    else:
        print("  ✓ respaldar baja el riesgo, acumular lo sube, cubrir sube la resiliencia")

    print("\n── 5. Sensibilidad a los pesos (±50%, 200 corridas) ──")
    s = sensibilidad_pesos(items, eventos)
    print(f"  Spearman vs. ranking base: mediana {s['spearman_mediana']}, peor caso {s['spearman_minimo']}")
    print(f"  El primer puesto se conserva en el {s['lider_estable_pct']}% de las corridas")
    if s["spearman_mediana"] < 0.9:
        graves += 1
        print("  ✗ el ranking depende demasiado de los pesos elegidos a mano")

    print("\n── 6. Contra el juicio del equipo ──")
    h = vs_ranking_humano(scores)
    if h is None:
        print(f"  — falta {RUTA_RANKING_HUMANO}. Es la única verdad de referencia real:")
        print('    pregunta a cada quien "¿quién es más crítico?" y guarda {"email": posición}.')
    elif "error" in h:
        print(f"  ✗ {h['error']}")
    else:
        print(f"  Spearman {h['spearman']} sobre {h['n']} personas · "
              f"primer puesto {'coincide' if h['coincide_el_primero'] else 'NO coincide'}")
        print(f"    sistema: {[p.split('@')[0] for p in h['sistema']]}")
        print(f"    equipo:  {[p.split('@')[0] for p in h['humanos']]}")
        if h["spearman"] < 0.5:
            graves += 1

    print(f"\n{'✓ sin problemas graves' if not graves else f'✗ {graves} problema(s) grave(s)'}\n")
    return graves


def main() -> int:
    from .nucleo import extraer

    eventos = [RawEvent.model_validate(e) for e in json.loads(Path("data/raw/mock_events.json").read_text(encoding="utf-8"))]
    items = extraer(eventos)  # usa la caché; sin API key valida los mocks
    return 1 if reporte(items, eventos) else 0


if __name__ == "__main__":
    raise SystemExit(main())
