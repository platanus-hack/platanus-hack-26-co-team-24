# P3 — API de Bus Factor HQ

**Para P4 y P5: esto es lo único con lo que hablan.** Nunca a Slack, Claude ni
Supabase directo.

Documentación viva y siempre correcta en **`/docs`** (Swagger). Lo de abajo es el
resumen; si algo no cuadra, manda `/docs`, que sale de los modelos reales.

## Correr

```bash
uv venv --python 3.12
uv pip install anthropic pydantic fastapi "uvicorn[standard]"
uv run uvicorn backend.app:app --reload --port 8000
```

Si `/avatar` o `/usuarios/*` responden 404, falta `httpx`: las rutas de auth
revientan al importarse. Se arregla con `uv pip install -e ".[api]"`.

Sin `ANTHROPIC_API_KEY` funciona igual: el cerebro cae a datos escritos a mano.

```bash
curl -X POST localhost:8000/admin/procesar   # llena el estado con datos reales
python test_backend.py                       # 15 checks, sin red
```

## El flag que salva el demo

**Todos los endpoints de lectura aceptan `?mock=true`.** Devuelve datos escritos
a mano que cumplen el contrato exacto, funcionan con la base vacía, sin API key y
sin red. Si en vivo se cae algo, se agrega `?mock=true` y el show sigue.

Para forzarlo en toda la API sin tocar las URLs: `BUSFACTOR_MOCK=1`.

Y aunque no lo pidan: si nadie corrió `/admin/procesar`, los endpoints caen a mock
solos. Una oficina sin personajes parece un bug, no un estado vacío.

## Endpoints

| Método | Ruta | Para quién | Devuelve |
|---|---|---|---|
| GET | `/salud` | todos | estado del backend y de dónde salen los datos |
| GET | `/oficina` | **P4** | los 9 miembros con avatar, score y items críticos |
| GET | `/riesgo` | P4, P5 | `RiskScore[]` + `resiliencia_equipo` |
| GET | `/conocimiento` | P5 | `KnowledgeItem[]`. Filtros: `persona`, `tipo`, `solo_criticos` |
| GET | `/escenarios` | **P4** | los 7 de la consola arcade |
| POST | `/simular` | **P4** | `SimulationResult` con el `playbook_md` |
| GET | `/digest` | **P5** | quests de la semana + puntaje |
| PUT | `/quests/{id}` | **P5** | completa una quest y devuelve el puntaje nuevo |
| POST | `/admin/procesar` | P3 | corre la cadena de P2 y persiste |
| POST | `/admin/reset` | P5 | vuelve al estado demo perfecto entre ensayos |

Los modelos `KnowledgeItem`, `RiskScore`, `SimulationResult`, `Quest` y `Escenario`
son **los de `cerebro/esquemas.py` sin tocar**. Ese archivo es el contrato; aquí no
se redefine nada para que no se desincronice.

### `GET /oficina` — lo que pinta la oficina

```json
{
  "oficina": { "id": "of-demo", "nombre": "Bus Factor HQ" },
  "resiliencia_equipo": 28.6,
  "miembros": [
    {
      "email": "ana@empresa.com",
      "nombre": "Ana Sofía Suárez",
      "rol": "Operaciones",
      "sprite": "lpc-01",
      "avatar_config": { "cuerpo": 1, "peinado": 3, "ropa": 2, "paleta": "coral" },
      "score": 100,
      "items_criticos": ["ki-001", "ki-002", "ki-003"],
      "total_items": 3,
      "detalle": "3 elemento(s) a su nombre. 3 sin ningún respaldo (bus factor 1)…"
    }
  ]
}
```

Vienen ordenados por `score` descendente. Los colores de P4 salen de ahí:
verde 0-40, amarillo 41-70, rojo pulsante 71-100.

**P4:** `avatar_config` es JSON libre — el formato lo defines tú, yo solo lo
guardo. Lo que está ahí es un marcador de posición; mándame el tuyo y lo cambio.

### `POST /simular`

```json
{ "scenario_id": "renuncia", "objetivo_id": "ana@empresa.com" }
```

`renuncia` y `robo_pc` exigen `objetivo_id`; los otros cinco no (`requiere_objetivo`
en `GET /escenarios` lo dice). Escenario inexistente u objetivo faltante → **422**.

Nunca falla por culpa de Claude: si no responde a tiempo, devuelve un playbook
determinista con los mismos datos y lo anota en `advertencias`. `generado_por` dice
de dónde salió: `claude`, `respaldo` o `mock`. Tarda entre 5 y 15 segundos con
Claude — P4 lo cubre con la animación.

## Dos números, y no son intercambiables

Esto es de P2 y hay que respetarlo:

| Campo | Qué es | Quién lo usa |
|---|---|---|
| `RiskScore.score` | 0-100 **relativo al equipo** | P4, para los colores |
| `resiliencia_equipo` | 0-100 absoluto, comparable entre semanas | **P5, es el puntaje del pitch** |

El `score` relativo **no puede medir progreso**: si todo el equipo mejora, el
máximo baja y los scores se quedan igual. El número que sube cuando alguien
completa una quest es `resiliencia_equipo`.

### `PUT /quests/{id}` — el momento demoable de P5

```json
{ "estado": "completada", "respaldo_email": "camilo@empresa.com" }
```

`respaldo_email` es opcional: si no viene, se deduce del texto de la acción (las
quests dicen "…para Camilo") y, en último caso, del grafo de colaboración.

Completar la quest **cambia los datos**: registra al receptor como respaldo del
item, recalcula el riesgo y devuelve el puntaje nuevo con su delta. Es idempotente
—el doble clic del ensayo no suma dos veces—.

```json
{
  "quest": { "id": "q-001", "estado": "completada", "puntos": 30, "…": "…" },
  "item": { "id": "ki-003", "respaldos": ["camilo@empresa.com"], "…": "…" },
  "respaldo_email": "camilo@empresa.com",
  "resiliencia_equipo": 35.7,
  "delta": 7.1
}
```

## Cosas que conviene saber

- CORS abierto a todo. Es hackathon.
- Cada request se loggea con su tiempo de respuesta. Si algo falla en integración,
  ese log resuelve la discusión en segundos.
- `/admin/procesar` es manual a propósito: `extraer()` cuesta tokens y segundos y
  nunca corre dentro de un request de lectura. En el demo solo `/simular` va en vivo.
- El resultado se guarda en `data/estado.json`, así que reiniciar el proceso no
  vacía la oficina.

## Deploy

Render no puede conectarse al repo de la organización, así que se despliega desde
un espejo personal. El remoto ya está configurado para empujar a los dos a la vez:

```
origin  git@github.com:platanus-hack/platanus-hack-26-co-team-24.git  (fetch, push)
origin  git@github.com:Jhosgun/bus-factor-hq.git                      (push)
```

Un `git push` normal actualiza ambos. En el dashboard de Render: **New → Web
Service → Jhosgun/bus-factor-hq**, rama `feat/p3-backend` (es la rama por
defecto del espejo). `render.yaml` ya trae build, start y healthcheck; lo único
que se pone a mano es `ANTHROPIC_API_KEY`.

El build (`pip install -e ".[api]"`) está verificado en un venv limpio, y la app
arranca desde cualquier directorio — se probó con el CWD en `/tmp`.

Dos cosas del plan gratuito que hay que tener en cuenta **antes** del demo:

- **El servicio se duerme** a los 15 minutos sin tráfico y despertar tarda casi un
  minuto. Pegarle a `/salud` unos minutos antes de salir a presentar.
- **El disco es efímero.** `data/estado.json` y la caché de P2 no sobreviven un
  reinicio, así que tras cada deploy hay que correr `POST /admin/procesar` — o
  Tras cada deploy estable hay que sembrar (el disco de Render arranca vacío):

```
curl -X POST https://bus-factor-hq.onrender.com/admin/sembrar
```

## Usuario

| Método | Ruta | Auth | Devuelve |
|---|---|---|---|
| POST | `/auth/registro` | no | `{token, user}` |
| POST | `/auth/login` | no | `{token, user}` |
| GET | `/usuarios/me` | Bearer | User |
| PUT | `/usuarios/me/avatar` | Bearer | `{ok, email, avatar_config}` |
| PUT | `/avatar` | no (P4) | igual. `?email=` o body; default Ana |
| POST | `/conexiones` | opcional | `{tipo, estado: "activa"}` simulado |

`PUT /avatar` acepta el body de P4 tal cual: `{cuerpo, peinado, ropa, paleta}`.

