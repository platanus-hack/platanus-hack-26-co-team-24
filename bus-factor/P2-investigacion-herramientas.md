# Investigación — herramientas libres para medir bus factor y centralidad

Documento de apoyo de P2. Responde tres cosas: qué existe ya en software libre,
qué de eso usamos, y qué NO usamos (y por qué). La última columna es la que
alimenta la sección "Diferenciador" del pitch.

---

## 1. Bus factor sobre repositorios Git

Es el nicho más maduro. Todos son de línea de comandos y corren en Linux.

| Herramienta | Lenguaje | Qué hace | Licencia |
|---|---|---|---|
| [`truckfactor`](https://pypi.org/project/truckfactor/) (HelgeCPH) | Python, `pip install truckfactor` | Lee el `git log`, atribuye propiedad de cada archivo a quien más líneas editó, y calcula el número mínimo de personas cuya salida deja huérfano >50% del código | MIT |
| [`Truck-Factor`](https://github.com/aserg-ufmg/Truck-Factor) (UFMG) | Java + Ruby | Implementación del paper académico de referencia (Avelino et al.). Es la definición canónica de "truck factor" | MIT |
| [`code-maat`](https://github.com/adamtornhill/code-maat) (Adam Tornhill) | Clojure | Minería de historia de VCS: hotspots, acoplamiento temporal, **métricas de propiedad de conocimiento por autor y por módulo**. Es el motor libre detrás del libro *Your Code as a Crime Scene* | GPL |
| [`hercules`](https://github.com/src-d/hercules) | Go | Burndown de líneas y propiedad **a lo largo del tiempo**, acoplamiento temporal. Reimplementación rápida de git-of-theseus | Apache 2.0 |
| [`git-of-theseus`](https://github.com/erikbern/git-of-theseus) | Python | Cómo envejece el código por cohorte y por autor. Más visual que analítico | MIT |

**Lectura para nosotros:** todas comparten la misma limitación, y es exactamente
nuestro hueco de mercado — **solo miran el repositorio**. El acceso al CRM que
solo tiene Ana, la regla de LATAM, el turno de soporte hasta las 8pm: nada de eso
está en un `git log`. El PDF ya lo dice ("ignoran el 80% del conocimiento que no
es código"); estas herramientas son la evidencia concreta de esa afirmación si el
jurado pregunta.

**Uso posible en el hackathon:** ninguno directo. Si sobra tiempo, correr
`truckfactor` sobre el repo de prueba de P1 da un número de contraste ("Git dice
bus factor 2; nosotros, mirando además Slack y Meet, decimos 1") — es una línea
de pitch fuerte y cuesta un `pip install`. Queda como idea, no como tarea.

---

## 2. Análisis de grafos y centralidad

Aquí está la idea de valorar a alguien por su red de conexiones (la analogía de
las redes de pases en fútbol).

| Librería | Instalación | Cuándo vale la pena |
|---|---|---|
| [NetworkX](https://networkx.org/) | `pip install networkx`, sin compilar | El estándar. Legible, todas las centralidades implementadas. **Puro Python: 40-250× más lento que graph-tool**, irrelevante por debajo de miles de nodos |
| [python-igraph](https://python.igraph.org/) | `pip install igraph`, núcleo en C | ~8× más rápido que NetworkX en betweenness. Buen punto medio |
| [graph-tool](https://graph-tool.skewed.de/) | Solo `apt`/`conda`, C++ con plantillas | El más rápido, y con OpenMP paraleliza betweenness. Compilar toma horas: no en un hackathon |
| [NetworKit](https://networkit.github.io/) | `pip`, núcleo C++ paralelo | El mejor en betweenness a gran escala |
| [rustworkx](https://www.rustworkx.org/) | `pip`, núcleo en Rust | Nacido en Qiskit; API tipo NetworkX con rendimiento nativo |

Para visualizar: [Gephi](https://gephi.org/) (escritorio, exploración
interactiva) y [Cytoscape](https://cytoscape.org/) (más biológico pero genérico).
Ninguno se embebe en web — nuestra oficina de Phaser es P4, no un renderer de
grafos.

**Decisión tomada:** ninguna de las anteriores. `cerebro/grafo.py` implementa
el algoritmo de Brandes en ~25 líneas de stdlib. Con 9-200 personas cualquiera de
estas librerías es una dependencia que no compra nada, y NetworkX en Railway/Render
es un `pip install` más que puede fallar en el deploy la noche del demo.
Si el equipo alguna vez pasa de ~5.000 personas, la migración es cambiar
`intermediacion()` por `networkx.betweenness_centrality()` — una línea.

### Sobre la analogía del fútbol

La idea que mencionaste está bien fundamentada y es literalmente la misma
matemática. En el análisis de redes de pases se usan
[`socceraction`](https://github.com/ML-KULeuven/socceraction) y
[`mplsoccer`](https://github.com/andrewRowlinson/mplsoccer) (ambas MIT) para
construir el grafo, y **NetworkX para calcular las centralidades**: grado
(cuántos compañeros distintos toca), *betweenness* (por cuántos caminos de balón
pasa) y el *índice de centralización* del equipo (¿el juego depende de uno solo?).
Un jugador con betweenness alta es el que rompe el equipo si sale — que es
exactamente la pregunta del bus factor.

Eso es lo que quedó implementado: cada evento de Slack, review de PR o reunión de
Meet es un "pase", y la intermediación entra al score de riesgo con un
multiplicador de hasta 1.5×. En los datos de prueba, Ana pasa de tener el score
más alto solo por conocimiento a tenerlo también por posición en la red — es la
misma persona, con dos argumentos independientes.

**Segunda métrica implementada:** `islas_al_remover()` — si esta persona
desaparece, ¿en cuántos grupos incomunicados se parte el equipo? Con 9 personas
casi nunca se activa (el grafo de prueba está bien conectado y nadie es punto de
articulación), pero cuando se activa es la frase más contundente del demo:
*"si Ana se va, operaciones y desarrollo dejan de hablarse"*.

---

## 3. Análisis de redes organizacionales (ONA)

Es la categoría comercial más cercana a lo que hacemos: mapear cómo fluye la
información real en una empresa a partir de metadatos de Slack, correo y
calendario. [Worklytics](https://www.worklytics.co/), Microsoft Viva Insights,
[Polinode](https://www.polinode.com/) y tyGraph son los actores.

Sus métricas son las mismas que usamos: **grado = conector clave y riesgo de
sobrecarga; betweenness = cuello de botella o intermediario crítico**. Que la
industria de ONA use exactamente estas dos métricas es la validación de que el
enfoque de grafo no es decoración.

**Hallazgo relevante:** no aparece ninguna herramienta ONA libre de peso. Y las
comerciales se quedan en el *quién habla con quién* — miden el flujo, no el
contenido. Ninguna extrae **qué sabe cada persona**, ninguna captura reglas
tácitas, y ninguna simula la ausencia. Ese es el hueco:

> ONA responde "¿quién es el cuello de botella?".
> Bus Factor HQ responde "¿qué exactamente se pierde si ese cuello de botella se va, y qué hago el lunes?".

---

## 4. Lo que decidimos NO usar

| Descartado | Motivo |
|---|---|
| NetworkX / igraph / graph-tool | 25 líneas de stdlib cubren el caso; una dependencia menos que se rompa en el deploy |
| Gephi / Cytoscape | Son escritorio; la visualización es Phaser (P4) |
| `truckfactor`, `code-maat`, `hercules` | Solo miran Git — el 20% del problema. Sirven como argumento en el pitch, no como dependencia |
| Similitud coseno / clustering para deduplicar | Un solo pase con Claude fusiona "compra los vuelos del jefe" con "gestiona los tiquetes de la gerencia"; ninguna métrica de texto hace eso |
| pgvector / embeddings para el playbook | Con ~30 elementos de conocimiento caben todos en el prompt. El retrieval es necesario a partir de cientos; hoy sería latencia y una dependencia de la BD de P3 sin ganancia. Está anotado como deuda |

---

## Fuentes

- [truckfactor (PyPI)](https://pypi.org/project/truckfactor/0.2.4) · [HelgeCPH/truckfactor](https://github.com/HelgeCPH/truckfactor)
- [aserg-ufmg/Truck-Factor](https://github.com/aserg-ufmg/Truck-Factor)
- [adamtornhill/code-maat](https://github.com/adamtornhill/code-maat) · [Code Maat](https://www.adamtornhill.com/code/codemaat.htm)
- [src-d/hercules](https://github.com/src-d/hercules) · [erikbern/git-of-theseus](https://github.com/erikbern/git-of-theseus)
- [graph-tool performance](https://graph-tool.skewed.de/performance.html) · [Benchmark of popular graph/network packages](https://www.timlrx.com/blog/benchmark-of-popular-graph-network-packages-v2/) · [rustworkx paper](https://arxiv.org/pdf/2110.15221) · [NetworKit paper](https://arxiv.org/pdf/1403.3005)
- [Passing networks — Soccermatics](https://soccermatics.readthedocs.io/en/latest/gallery/lesson1/plot_PassNetworks.html) · [PySport open source overview](https://opensource.pysport.org/?sports=Soccer) · [Motif analysis in football passing networks](https://arxiv.org/pdf/2408.07927)
- [Polinode — guía de ONA](https://www.polinode.com/guides/what-is-organizational-network-analysis-a-comprehensive-guide) · [Teamspective — ONA](https://teamspective.com/blog/organizational-network-analysis/) · [Worklytics](https://www.worklytics.co/ona-data-analytics-software-worklytics)
