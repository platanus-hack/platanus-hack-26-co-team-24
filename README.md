<img src="./project-logo.png" alt="Bus Factor HQ" width="160" />

# Bus Factor HQ

**Simulador arcade de emergencias organizacionales: descubre qué se rompe si mañana falta tu persona clave.**

Platanus Hack 26 · Bogotá · Track 🚨 Emergencies · team-24

---

## El problema

Todo equipo tiene un **bus factor de 1** en algo: una sola persona que es admin del CRM,
que sabe hacer el rollback, que compra los vuelos del jefe sabiendo que solo le gusta LATAM.
Ese conocimiento no vive en la wiki: vive en hilos de Slack, en reuniones de Meet que nadie
vuelve a ver, y en la cabeza de la gente.

## Qué hace

Lee lo que el equipo ya produce en **Slack, GitHub y las transcripciones de Meet**, y arma solo
el mapa de quién sabe qué —tareas, accesos, procesos y reglas tácitas—. Con ese mapa:

1. **Simula la emergencia antes de que ocurra.** Eliges un escenario en la consola arcade
   (renuncia, robo del computador, caída de GitHub, apagón…) y sobre una oficina pixel art ves
   qué se rompe. En segundos devuelve las tareas huérfanas y un **documento de empalme** completo.
2. **Previene con misiones.** Cada viernes reparte quests de descentralización concretas
   (*"David: comparte el acceso del servidor con Samuel y documéntalo"*). Completarlas sube
   el puntaje de resiliencia del equipo.

Descripción larga y diferenciadores: [`project-description.md`](./project-description.md).

## Cómo funciona

```
Slack · GitHub · Meet  →  Extracción con Claude  →  Mapa de conocimiento
                                                          ↓
                         Puntaje de riesgo  ←  Grafo de colaboración
                                                          ↓
                                Simulación  →  Playbook de empalme + quests
```

- **Extracción.** Claude saca elementos de conocimiento con dueño, respaldos y cita textual
  como evidencia. Todo lo que atribuya a alguien que no aparece en los datos se descarta.
- **Riesgo.** Pesa lo que cada quien sabe por tipo (un acceso pesa más que una tarea) y lo
  descuenta por cobertura. Un respaldo único sigue pesando: bus factor 2 también es frágil.
- **Bus factor del equipo.** Heurístico greedy sobre el mapa de conocimiento — muestra la
  cascada, no solo el número.
- **Grafo de colaboración.** Cada mensaje, review o reunión es un "pase"; la intermediación
  mide por cuántos caminos de información pasa cada persona, y quién puede recibir el traspaso.
- **Autocrítica.** El playbook se evalúa de 0 a 10 y se reescribe si no llega a 8.

## Estructura

| Carpeta | Qué es | Stack |
|---|---|---|
| `cerebro/` | Extracción, riesgo, simulación y quests. Módulo importable, sin HTTP | Python + Claude API |
| `backend/` | La API que consumen los frontends. Swagger en `/docs` | FastAPI |
| `frontend/` | Oficina pixel art + dashboard ([contrato y adaptaciones](./frontend/README.md)) | React, Phaser 3, Vite |
| `data/raw/` | Eventos normalizados de la ingesta | JSON |
| `bus-factor/` | Documentos de trabajo por rol | — |

## Correrlo

**Cerebro + API** (sin `ANTHROPIC_API_KEY` funciona igual, con playbook determinista):

```bash
uv venv --python 3.12
uv pip install -e ".[api]"
export ANTHROPIC_API_KEY=sk-...
uv run uvicorn backend.app:app --reload --port 8000
curl -X POST localhost:8000/admin/procesar    # llena el estado con datos reales
```

**Frontend:**

```bash
cd frontend
npm i
cp .env.example .env      # VITE_API_URL=http://localhost:8000 · vacío = modo mock
npm run dev
```

### Dirección de arte

Guía completa: [`docs/design/guia-visual.dc.html`](./docs/design/guia-visual.dc.html) ("Synth Dusk"). Nada fuera de esta lista.

| Color | Hex | Papel |
|---|---|---|
| VOID | `#120A20` | fuera de la sala, sombra |
| BASE | `#1A0F2E` | fondo de la escena |
| SURFACE | `#241543` | paneles y tarjetas |
| LINE | `#43276B` | bordes y divisores |
| TURQUESA | `#2BD9D0` | datos: pantallas, cifras, borde de panel activo |
| ROSA | `#FF4D9D` | acción: consola y botón primario |
| LIMA | `#B6FF3C` | vivo: infra sana, quest hecha, restaurar |
| ORO | `#FFD166` | puntaje: resiliencia, puntos, premios |
| NARANJA | `#FF7A2F` | luz cálida: puerta, sillas, cafetera |
| LILA | `#A98BFF` | mobiliario |
| MORADO | `#7B3FE4` | sala de juntas |
| ROJO | `#FF2E63` | solo emergencia activa o riesgo >= 70 |

Texto `#F3E8FF`, texto secundario `#A98CD6`. Un color, un papel: el turquesa nunca es botón y el rosa nunca es dato.

**Tipografías:** Workbench solo para títulos y logo (>=32 px) · Jersey 15 para cuerpo, descripciones y listas (22/24/30) · VT323 para etiquetas, HUD, cifras y el playbook (17/20/24, MAYÚSCULAS con tracking).

**Movimiento:** caminar a 64 px/s lineal · nunca más de 3 personajes moviéndose a la vez, con desfases de 2–4 s · el panel de resultado entra deslizando 24 px sólo cuando terminó la animación del escenario.

**Verificar:**

```bash
python test_cerebro.py    # checks de unidad, sin red ni API key
python test_backend.py
cd frontend && npm test
```

## El demo nunca se cae

Todos los endpoints de lectura aceptan **`?mock=true`** (o `BUSFACTOR_MOCK=1`): datos escritos
a mano que cumplen el contrato exacto, sin base, sin API key y sin red. El frontend con
`VITE_API_URL` vacío corre 100% offline. `simular()` cae a un playbook de respaldo determinista
si el modelo falla o se pasa del timeout.

## Deploy

`<FILL THIS>`
