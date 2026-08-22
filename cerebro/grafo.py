"""Grafo de colaboración: quién trabaja con quién.

La idea es la misma que se usa para valorar futbolistas por su red de pases: un
jugador no vale solo por sus goles, sino por cuántas conexiones del equipo pasan
por él. Aquí las "pases" son co-participaciones — un mensaje de Slack, un review
de PR, una reunión de Meet — y la persona valiosa es la que conecta subgrupos
que de otro modo quedarían aislados.

Tres señales, todas calculadas sobre eventos crudos de P1:

- **grado**: con cuánta gente distinta colabora (¿es un hub?).
- **intermediación** (betweenness): qué fracción de los caminos más cortos del
  equipo pasa por esa persona. Es la métrica que usan los análisis de redes de
  pases: mide quién hace circular la información, no quién habla más.
- **puente**: si esa persona desaparece, ¿en cuántas islas se parte el equipo?
  Más de una isla = punto de articulación. Señal binaria y dramática, pero rara
  en equipos pequeños; por eso el score usa la intermediación.
"""

from __future__ import annotations

from collections import deque

from .esquemas import RawEvent

# persona -> {vecino: nº de eventos compartidos}. Iterarlo da los vecinos, así
# que los algoritmos de abajo lo tratan como lista de adyacencia sin cambios.
Grafo = dict[str, dict[str, int]]


def construir_grafo(eventos: list[RawEvent]) -> Grafo:
    """Une a autor y participantes de cada evento: cada evento es un 'pase'.

    El peso de la arista es cuántas veces dos personas coincidieron: un hilo
    suelto de Slack no es lo mismo que veinte reviews de PR.
    """
    grafo: Grafo = {}
    for ev in eventos:
        personas = {p for p in [ev.autor_email, *ev.participantes] if p}
        for p in personas:
            grafo.setdefault(p, {})
        for p in personas:
            for otro in personas - {p}:
                grafo[p][otro] = grafo[p].get(otro, 0) + 1
    return grafo


def colaboradores(grafo: Grafo, persona: str, limite: int = 4) -> list[tuple[str, int]]:
    """Con quién trabaja más esta persona, de mayor a menor.

    Es lo que responde "¿y si nadie la respalda, a quién le paso esto?": quien
    ya está más cerca por co-participación real, no por organigrama.
    """
    vecinos = grafo.get(persona, {})
    return sorted(vecinos.items(), key=lambda kv: (-kv[1], kv[0]))[:limite]


def _componentes(grafo: Grafo, excluir: str | None = None) -> int:
    """Número de componentes conexas, opcionalmente sacando a una persona."""
    nodos = {n for n in grafo if n != excluir}
    vistos: set[str] = set()
    islas = 0
    for inicio in nodos:
        if inicio in vistos:
            continue
        islas += 1
        cola = deque([inicio])
        vistos.add(inicio)
        while cola:
            actual = cola.popleft()
            for vecino in grafo[actual]:
                if vecino in nodos and vecino not in vistos:
                    vistos.add(vecino)
                    cola.append(vecino)
    return islas


def islas_al_remover(grafo: Grafo) -> dict[str, int]:
    """Por persona: en cuántas islas queda el equipo si esa persona desaparece.

    Si el resultado es mayor que el número de islas actual, la persona es un
    punto de articulación — el único puente entre dos partes del equipo.
    """
    # ponytail: fuerza bruta O(n·(V+E)). Con 9-200 personas es instantáneo;
    # si algún día son miles, cambiar a puntos de articulación de Tarjan.
    return {persona: _componentes(grafo, excluir=persona) for persona in grafo}


def es_puente(grafo: Grafo) -> dict[str, bool]:
    base = _componentes(grafo)
    return {persona: islas > base for persona, islas in islas_al_remover(grafo).items()}


def grado(grafo: Grafo) -> dict[str, int]:
    """Con cuánta gente distinta colabora cada persona."""
    return {persona: len(vecinos) for persona, vecinos in grafo.items()}


def intermediacion(grafo: Grafo) -> dict[str, float]:
    """Betweenness centrality normalizada a 0-1 sobre el máximo del equipo.

    Algoritmo de Brandes: por cada origen, BFS contando caminos más cortos y
    después una acumulación hacia atrás de dependencias. 1.0 = la persona por
    la que pasa más información del equipo.
    """
    puntaje = {v: 0.0 for v in grafo}
    for origen in grafo:
        pila: list[str] = []
        predecesores: dict[str, list[str]] = {v: [] for v in grafo}
        caminos = {v: 0.0 for v in grafo}
        caminos[origen] = 1.0
        distancia = {v: -1 for v in grafo}
        distancia[origen] = 0
        cola = deque([origen])
        while cola:
            v = cola.popleft()
            pila.append(v)
            for w in grafo[v]:
                if distancia[w] < 0:
                    distancia[w] = distancia[v] + 1
                    cola.append(w)
                if distancia[w] == distancia[v] + 1:
                    caminos[w] += caminos[v]
                    predecesores[w].append(v)
        dependencia = {v: 0.0 for v in grafo}
        while pila:
            w = pila.pop()
            for v in predecesores[w]:
                dependencia[v] += caminos[v] / caminos[w] * (1 + dependencia[w])
            if w != origen:
                puntaje[w] += dependencia[w]

    maximo = max(puntaje.values(), default=0.0)
    if maximo == 0:
        return {v: 0.0 for v in grafo}
    return {v: p / maximo for v, p in puntaje.items()}
