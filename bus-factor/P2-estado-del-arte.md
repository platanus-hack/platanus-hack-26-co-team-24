# Estado del arte de P2 — qué se publicó, qué adoptamos

Documento de apoyo de P2. Contrasta lo que construimos contra la literatura reciente:
qué respalda nuestras decisiones, qué nos faltaba, y qué queda de roadmap.

Complementa a [`P2-investigacion-herramientas.md`](./P2-investigacion-herramientas.md),
que cubre las herramientas libres. Este cubre los papers.

---

## 1. El paper que valida la tesis entera

**[Bus Factor In Practice](https://arxiv.org/abs/2202.01523)** — Jabrayilzade et al.,
ICSE 2022 SEIP (JetBrains).

Proponen un algoritmo **multimodal** de bus factor que combina datos de control de
versiones **con code reviews y reuniones**. Lo validan sobre 13 proyectos de JetBrains
contra encuestas a **269 ingenieros** y supera ligeramente a la herramienta de referencia.
Concluyen que el bus factor se percibe como un problema real y que hay canales de
conocimiento con más impacto que otros.

**Qué significa para el pitch:** nuestra tesis no es una corazonada, está publicada y
validada con 269 humanos. Y nosotros vamos un paso más allá: ellos suman reuniones *al
código*; nosotros capturamos conocimiento que no es código en absoluto — accesos,
procesos y reglas tácitas. Si el jurado pregunta si esto ya existe, la respuesta honesta
es "existe la mitad, y está publicada".

## 2. El baseline canónico — y lo que nos faltaba

**[A Novel Approach for Estimating Truck Factors](https://arxiv.org/pdf/1604.06766)** —
Avelino et al.

Define el **Degree of Authorship** por desarrollador y archivo:

```
DOA = 3.293 + 1.098·FA + 0.164·DL − 0.321·ln(1 + AC)
```

donde `FA` es si creó el archivo, `DL` sus cambios y `AC` los de los demás. Con eso
identifica al experto de cada archivo y corre un **heurístico greedy**: quita
iterativamente al desarrollador experto en más archivos hasta que más de la mitad del
proyecto queda sin experto. Ese conteo es el truck factor.

**Lo que encontramos revisando nuestro código:** el producto se llama Bus Factor HQ y
**no calculaba el bus factor en ninguna parte**. Teníamos scores 0-100 por persona pero
no el número que da nombre al proyecto.

**Implementado.** `bus_factor()` en `cerebro/nucleo.py` porta el greedy de Avelino de
archivos de código a elementos de conocimiento. Una persona *sabe* un elemento si es su
dueño o está en sus respaldos; cada elemento pesa según su tipo. Sobre los datos de
prueba:

```
BUS FACTOR: 3
  1. sin ana@empresa.com          → 29% del conocimiento sin dueño
  2. sin valentina@empresa.com    → 38% del conocimiento sin dueño
  3. sin brayan@empresa.com       → 52% del conocimiento sin dueño
```

El tercer paso es el hallazgo interesante y no lo habríamos visto sin el algoritmo:
**Brayan parecía cubierto** — su acceso al workspace de Google tiene a Valentina como
respaldo. Pero Valentina ya salió en el paso 2. Un respaldo que ya se fue no respalda a
nadie. Esa cascada es exactamente lo que una lista plana de "quién tiene respaldo" no
muestra.

## 3. Conocimiento tácito con LLM

**[Leveraging LLMs for Tacit Knowledge Discovery in Organizational Contexts](https://arxiv.org/abs/2507.03811)**
— Zuin et al., IJCNN 2025.

Un agente por *prompt-chaining* reconstruye conocimiento organizacional entrevistando
empleados. Las piezas que importan:

- **Ciclo de autocrítica:** el agente puntúa su propia salida de 0 a 10. Llegar a 8+ exige
  conocimiento tácito real; **la especulación no se permite**, y si hay incertidumbre el
  puntaje baja automáticamente. La crítica se realimenta a la siguiente iteración.
- **Difusión como proceso SI con infectividad decreciente:** `β(t) = β₀·e^(−γt)`. El
  conocimiento se propaga por la red formal y la informal, y la capacidad de transmitirlo
  decae con el tiempo.
- **Navegación por pila:** cuando alguien menciona a un colega, ese colega salta al tope
  de la cola de entrevistas.
- **Resultado:** 94.9% de recall en 864 simulaciones, recuperando información **sin
  contactar nunca al único especialista de la fuente**.
- **Limitaciones que declaran:** todo es simulación sintética, los "empleados" son LLMs, y
  los resultados dependen de parámetros del modelo SI elegidos de forma algo arbitraria.

**Implementado (recortado).** El playbook es la única salida de texto libre de nuestro
pipeline — todo lo demás pasa por salidas estructuradas — y es LA diapositiva del demo.
Ahora se autoevalúa: `_pulir_playbook()` lo puntúa de 0 a 10 con criterios duros (nombrar
las reglas tácitas explícitamente, asignar cada huérfano a una persona concreta con
justificación, pasos de 48 horas verificables, cero especulación) y lo reescribe una vez
si no llega a 8. El puntaje viaja en `SimulationResult.puntaje_playbook`.

Recortado a **una** iteración: el playbook corre en vivo delante del jurado y cada llamada
extra son segundos. Se apaga con `simular(..., autocritica=False)`.

## 4. Lo que confirma la métrica del grafo

**[Trusting code in the wild](https://arxiv.org/pdf/2306.00240)** aplica centralidad de red
a desarrolladores: **grado** = colaboración directa, **intermediación** = quién mantiene
conectada la red y por tanto es más influyente. Es exactamente lo que ya calcula
`cerebro/grafo.py` con el algoritmo de Brandes. No hubo nada que cambiar — hay que citarlo.

**[Knowledge Islands](https://arxiv.org/pdf/2408.08733)** visualiza concentración de
conocimiento por desarrollador. Mismo problema, salida estática; nuestra oficina pixel art
es la versión jugable.

## 5. El contrapunto, para tenerlo listo

**[Myth: The loss of core developers is a critical issue for OSS communities](https://arxiv.org/pdf/2412.00313)**
presenta evidencia de que muchos proyectos sobreviven la salida de sus desarrolladores
núcleo.

Si un jurado técnico lo saca, la respuesta: ese estudio mide supervivencia del *proyecto* a
largo plazo en código abierto, donde no hay nómina ni clientes esperando y el reemplazo es
voluntario y gratuito. Nosotros medimos el **coste de empalme** en una empresa: las semanas
de operación degradada entre la salida y la recuperación. Un proyecto puede sobrevivir y
aun así costar tres meses de productividad.

**[The Impact of Generative AI on Code Expertise Models](https://arxiv.org/pdf/2507.08160)**
añade munición del otro lado: el código escrito con IA rompe los modelos de expertise
basados en autoría — firmas el commit sin ser el experto. Mirar solo el `git log` es cada
año peor idea.

## 6. Arquitectura de referencia

**[GraphRAG](https://www.microsoft.com/en-us/research/project/graphrag/)** (Microsoft):
extracción de entidades con LLM → detección de comunidades con Leiden → resúmenes por
comunidad → retrieval consciente del grafo. **LightRAG** reduce ~60% el coste de indexado.

Nuestro pipeline es un GraphRAG recortado **a propósito**: hacemos extracción y grafo, y
saltamos comunidades y retrieval porque con decenas de elementos todo cabe en el prompt.
Es una decisión, no una omisión — y la frontera está identificada: a partir de unos
cientos de elementos hay que vectorizar y hacer retrieval antes de armar el prompt.

---

## Roadmap: lo que la literatura ofrece y no implementamos

| Idea | De dónde | Por qué no ahora |
|---|---|---|
| **Respaldos probables por difusión SI** — `β(t)=β₀e^(−γt)` sobre el grafo de colaboración, para estimar la probabilidad de que alguien sepa algo por cercanía y recencia. Daría "Laura probablemente sabe el 40% de lo de Ana" en vez de un binario. | Zuin et al. 2025 | Toca la fórmula de riesgo, que ya está validada y con arnés de pruebas. Es un cambio de modelo, no un añadido. |
| **Decaimiento temporal** — `RawEvent.timestamp` hoy solo ordena y va como texto en el prompt. Conocimiento de hace seis meses pesa igual que el de ayer. | El mismo `β(t)` | Barato de implementar, pero sin datos reales de P1 no hay cómo calibrar `γ`. |
| **Contraste con el baseline de Git** — correr [`truckfactor`](https://pypi.org/project/truckfactor/) sobre el repo de P1 y mostrar los dos números lado a lado: *"Git dice 2, nosotros decimos 1, y aquí está la regla de LATAM que Git no puede ver"*. | Avelino et al. | Depende de que P1 entregue GitHub real. Es la mejor línea de pitch que nos queda pendiente. |
| **Comunidades con Leiden** — detectar subequipos y resumirlos por comunidad. | GraphRAG | Con 9 personas no hay comunidades que detectar. A escala de cientos, sí. |
| **Pesos por canal** — Slack, GitHub y Meet no aportan conocimiento por igual. | Bus Factor In Practice | Ellos lo calibraron con 269 encuestas. Inventar los pesos sería peor que tratarlos igual. |
