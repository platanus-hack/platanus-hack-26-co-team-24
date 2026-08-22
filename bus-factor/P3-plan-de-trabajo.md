# P3 — Plan de trabajo (Backend, BD y Auth)

Plan operativo de Jorge (P3). Complementa `P3-backend.md`, que es el documento de
rol; esto es lo que efectivamente vamos a hacer, con las desviaciones justificadas
respecto al plan maestro.

---

## 0. Estado real del repo al empezar

Lo que ya existe:

| Pieza | Estado |
|---|---|
| `cerebro/` (P2, Andrés) | **Terminado y probado.** 23 tests en verde, sin red ni API key |
| `data/raw/fixture_p2.json` | 46 eventos, 9 personas, la historia de LATAM sembrada |
| P1 (ingesta) | Sin código. `data/raw/mock_events.json` está cedido pero vacío |
| P4 (juego), P5 (dashboard) | Sin código |
| PR #2 `fix/p2-rutas-independientes-del-cwd` | **Abierto. Bloquea a P3** |
| PR #3 `chore/metadata-del-proyecto` | Abierto, no bloquea |

Verificado en local:

```
46 eventos → 10 elementos de conocimiento
Resiliencia del equipo: 28.6/100
ana@empresa.com 100 · david 50 · valentina 23 · brayan 20 · jorge 14 · laura 12 · andres 2
simular("renuncia", ana) → 3 huérfanos + playbook con candidato por cercanía
```

### La consecuencia más importante

El plan maestro asume que P3 sirve **datos hardcodeados** en la hora 2-3 y conecta
el cerebro real en la hora 8-12. Eso ya no aplica: `cerebro` funciona hoy, y sus
cuatro funciones caen a mock solas si falta la API key. La API falsa y la API real
son **el mismo código con un flag distinto**.

Traducción: no escribo ni un JSON hardcodeado. `cerebro.mocks` ya trae los 9
miembros, 10 items, 9 scores, un playbook escrito a mano y 5 quests, con los mismos
emails que el fixture. Mi "API falsa" es `cerebro` con `mock=True`.

---

## 1. Desviaciones respecto a `P3-backend.md`

| Doc de rol | Lo que hago | Por qué |
|---|---|---|
| Fase 1: habilitar pgvector | **No lo habilito** | P2 decidió no usar embeddings (`P2-investigacion-herramientas.md` §4: con ~30 items caben todos en el prompt). Postgres plano basta. Si algún día hace falta, es una migración de una tabla |
| Fase 2 (h2-3) API falsa → Fase 4 (h8-12) cerebro real | Una sola pasada: API sobre `cerebro`, `?mock=true` conmuta | El cerebro ya existe. Mantener dos implementaciones sería duplicar el contrato |
| Fase 3 (h3-6) auth antes que el cerebro | **Auth después de los datos** | P4 y P5 están bloqueados por `/oficina` y `/riesgo`, no por login. Un dashboard sin datos no se puede pintar; un dashboard sin login sí |
| Tabla `knowledge_items` con columnas por campo | Columna `payload jsonb` + escalares indexados | `dueño_principal` lleva ñ. Y así P2 puede agregar campos sin migración |
| "un solo deploy" | Igual, pero con repo espejo | El repo de la org no acepta Render/Vercel (README raíz). Hay que espejar a un repo personal |

---

## 2. Arquitectura

Un solo proceso Python. `backend/` importa `cerebro` como módulo, no por HTTP.

```
platanus-hack-26-co-team-24/
├── cerebro/            # P2 — no lo toco
├── data/raw/           # P1 escribe aquí; cargar_eventos() lo lee solo
├── backend/
│   ├── app.py          # FastAPI: rutas, CORS, middleware de logging
│   ├── estado.py       # el store: Supabase si hay credenciales, JSON en disco si no
│   ├── auth.py         # Supabase Auth + validación de JWT
│   ├── esquemas.py     # SOLO lo que es de P3: Office, User, Connection, respuestas compuestas
│   └── seed.py         # borra y repuebla el estado demo perfecto
└── pyproject.toml      # una sola dependencia raíz, un solo venv
```

Se corre desde la raíz: `uv run uvicorn backend.app:app --reload --port 8000`.

**Regla que no se rompe:** `backend/esquemas.py` no redefine `KnowledgeItem`,
`RiskScore`, `SimulationResult` ni `Quest`. Los importa de `cerebro.esquemas` y los
devuelve tal cual. El contrato vive en un solo archivo o se desincroniza en tres
horas — y como FastAPI serializa los modelos Pydantic directo, Swagger sale gratis
y siempre correcto.

---

## 3. Contrato HTTP

Todos los endpoints de lectura aceptan `?mock=true`. Sin auth los de lectura; con
Bearer token los de usuario.

### Lectura (desbloquean a P4 y P5)

```
GET  /salud                              → {ok, hay_api_key, items_en_bd, fuente}
GET  /oficina                            → {oficina, miembros[]}  ← P4
GET  /riesgo                             → {scores: RiskScore[], resiliencia_equipo}
GET  /conocimiento?persona=&tipo=        → KnowledgeItem[]
GET  /escenarios                         → Escenario[]  (cerebro.ESCENARIOS, estático)
GET  /digest                             → {quests: Quest[], resiliencia_equipo, puntos_totales}
POST /simular {scenario_id, objetivo_id} → SimulationResult
```

`GET /oficina` es lo único compuesto: junta la tabla `users` de P3 (nombre, rol,
avatar_config, sprite) con los `RiskScore` del cerebro, cruzando por email.

```json
{
  "oficina": { "id": "...", "nombre": "Bus Factor HQ" },
  "miembros": [
    { "user_id": "...", "email": "ana@empresa.com", "nombre": "Ana Sofía",
      "rol": "Operaciones", "sprite": "lpc-01",
      "avatar_config": { "cuerpo": 2, "peinado": 5, "ropa": 1, "paleta": "azul" },
      "score": 100, "items_criticos": ["ki-001", "ki-002", "ki-003"],
      "detalle": "3 elemento(s) a su nombre. 3 sin ningún respaldo (bus factor 1)..." }
  ]
}
```

### Usuario

```
POST /auth/registro   {email, password, nombre}  → token + user
POST /auth/login      {email, password}          → token + user
GET  /usuarios/me                                → User
PUT  /usuarios/me/avatar {avatar_config}         → User      ← P4 define el JSON, yo lo guardo
POST /conexiones      {tipo: slack|drive}        → Connection (estado simulado "activa")
```

### Quests

```
PUT /quests/{id} {estado: "completada", respaldo_email?}
    → {quest, resiliencia_equipo, delta}
```

### Admin

```
POST /admin/procesar  → corre la cadena real y persiste. Manual, sin scheduler
POST /admin/reset     → equivalente a seed.py por HTTP (útil entre ensayos)
```

---

## 4. El punto sutil: qué número sube al completar una quest

P2 es explícito y hay que respetarlo o el momento demoable de P5 se cae:

- `RiskScore.score` es **relativo al equipo** — sirve para los colores de P4 y
  **no puede medir progreso**. Si todo el equipo mejora, el máximo baja y los
  scores relativos se quedan igual.
- `resiliencia_equipo(items)` es el número absoluto del pitch. Es el que sube.

Entonces `PUT /quests/{id}` no puede limitarse a marcar un booleano. Para que el
número se mueva tiene que **cambiar los datos**: añadir el receptor a
`respaldos[]` del `item_relacionado`, recalcular `calcular_riesgo()` y
`resiliencia_equipo()`, y devolver el delta.

Problema: `Quest` no tiene campo `receptor`; el receptor va en el texto de `accion`
("comparte el acceso con Samuel"). Solución sin tocar el contrato de P2: el body
acepta `respaldo_email` opcional; si no viene, se extrae el primer email del
`accion` y si tampoco hay, se usa el colaborador más cercano del grafo. Se decide
en P3, no se le pide a P2 un cambio de esquema a mitad de hackathon.

---

## 5. Modelo de datos (Supabase Postgres, sin pgvector)

```sql
offices          (id uuid pk, nombre text)
users            (id uuid pk, email text unique, nombre text, rol text,
                  office_id uuid, avatar_config jsonb, sprite text)
connections      (id uuid pk, user_id uuid, tipo text, estado text, creado_en timestamptz)
knowledge_items  (id text pk, office_id uuid, dueno_principal text, tipo text,
                  payload jsonb, actualizado_en timestamptz)
risk_scores      (persona_id text, office_id uuid, payload jsonb, calculado_en timestamptz)
quests           (id text pk, office_id uuid, asignado_a text, estado text,
                  payload jsonb)
simulations      (id uuid pk, office_id uuid, scenario_id text, objetivo_id text,
                  payload jsonb, creado_en timestamptz)
```

`payload` guarda el `model_dump()` completo del modelo de `cerebro`. Los escalares
de al lado son solo para filtrar. Ventaja concreta: si P2 agrega un campo, no hay
migración, y no peleamos con `dueño_principal` en SQL.

Se crea desde el SQL editor de Supabase, sin migraciones formales.

---

## 6. Orden de ejecución

### Bloque 0 — desbloquear ✅
Los PRs de Andrés los coordina Jorge, así que **no dependemos del #2**: el rodeo
está en `backend/__init__.py` y no toca una línea de `cerebro/`.

- `CEREBRO_CACHE_DIR` se fija a `RAIZ/.cache_cerebro` en el `__init__` del paquete,
  que corre antes que cualquier submódulo — que es la única garantía de orden que
  hace falta, porque `cerebro.llm` lee esa variable al importarse.
- `cargar_eventos()` acepta un `directorio` explícito, así que se le pasa
  `RAIZ/data/raw` en vez de confiar en el CWD.

Cuando el #2 entre, el rodeo se vuelve redundante pero no estorba.

### Bloque 1 — API viva, sin BD y sin auth ✅ **la entrega que desbloquea al equipo**
FastAPI + CORS abierto + middleware que loggea método, ruta y milisegundos.
Los 7 endpoints de lectura sirviendo desde `cerebro` con `mock=True`, más una tabla
`PERSONAS` en Python con los 9 nombres/roles/sprites cruzada con `mocks.EQUIPO`.
Cero Supabase, cero login.

→ verificar: `/docs` muestra los 7 endpoints; `curl /oficina` devuelve 9 miembros
con score; **avisar a P4 y P5 con la URL y preguntarles si les sirve el shape**
(preguntar, no asumir — está en el checklist del doc de rol).

### Bloque 2 — datos reales, todavía sin BD ✅
`POST /admin/procesar`: `cargar_eventos()` → `extraer()` → `calcular_riesgo()` →
`generar_digest()`, resultado en un store en memoria + snapshot en
`data/estado.json`. Los endpoints de lectura pasan a servir del store; `?mock=true`
sigue devolviendo los mocks. `/simular` pasa a ser real.

Con esto la **Cita H3 (P2+P3) queda cumplida sin Supabase.** Supabase no está en la
ruta crítica del demo, y saberlo es lo que nos deja dormir.

→ verificar: `POST /simular {renuncia, ana@empresa.com}` devuelve 3 huérfanos y un
playbook que menciona LATAM. Con `ANTHROPIC_API_KEY` puesta, `generado_por` dice
`claude`; sin ella, `respaldo`. Ambos casos se ven bien.

### Bloque 3 — Supabase: auth + persistencia (90 min) — **bloqueado**
Falta el proyecto de Supabase. Jorge lo crea y pasa `SUPABASE_URL` y la
`service_role key`; mientras tanto los Bloques 1, 2 y 4 ya dejan el demo completo.

Tablas por SQL editor. `estado.py` pasa de JSON a Postgres detrás de la misma
interfaz. Registro/login con Supabase Auth, validación de JWT en las rutas de
usuario, `PUT /avatar`, `POST /conexiones` simulado. `seed.py` que borra y repuebla
los 9 usuarios de la historia de P5.

→ verificar: registro → login → `GET /usuarios/me` con token, de corrido.
`seed.py` deja la BD demo-perfecta en una corrida.

### Bloque 4 — quests con puntaje ✅
`PUT /quests/{id}` con la mecánica de la sección 4. Verificado por HTTP:
completar `q-001` elige a Camilo desde el texto de la acción, lo registra como
respaldo de `ki-003` y sube la resiliencia de **28.6 a 35.7 (+7.1)**.

### Bloque 5 — deploy (45 min)
1. Repo personal + `git remote set-url --add --push origin` a ambos (instrucciones
   en el README raíz).
2. Render o Railway apuntando al repo personal. Variables: `ANTHROPIC_API_KEY`,
   `SUPABASE_URL`, `SUPABASE_KEY`.
3. `Procfile` / start command: `uvicorn backend.app:app --host 0.0.0.0 --port $PORT`.

→ verificar: **la API responde desde el celular en datos móviles.** Si el demo
depende de mi localhost, no hay demo.

### Bloque 6 — Cita H4 con P4 y P5
Acompañarlos en el cambio de URL. Donde haya fricción de formato, **cedo yo**: lo
que se ve es el frontend.

---

## 7. Riesgos y cómo se manejan

| Riesgo | Manejo |
|---|---|
| PR #2 sin mergear | Bloque 0. Es literalmente el primer paso |
| Disco efímero en Railway mata `.cache_cerebro` | Nunca llamar `extraer()` en el camino de un request. Los items viven en la BD; solo `simular()` corre en vivo |
| Supabase se pone difícil | El Bloque 2 ya deja el demo completo sin BD. Supabase es mejora, no requisito |
| Claude se cae en vivo | Tres capas: `simular()` ya devuelve playbook determinista solo; `?mock=true` devuelve el playbook escrito a mano; y el snapshot en disco tiene la última corrida buena |
| `simular()` con escenario inválido | Es el único `ValueError` que P2 sí levanta → mapear a HTTP 422 con el mensaje tal cual |
| Emails inventados por Claude | `SimulationResult.advertencias` ya los reporta. Loggearlos y avisar a P2, no ocultarlos |
| Frontends esperando un shape distinto | Preguntarles en el Bloque 1, no en la hora 14 |

---

## 8. Checklist (el de `P3-backend.md`, ajustado)

- [ ] PR #2 mergeado
- [ ] Los endpoints de lectura responden y Swagger los muestra
- [ ] **P4 y P5 confirmaron que consumen la API** (preguntado, no asumido)
- [ ] `POST /simular` real devuelve playbook con LATAM
- [ ] `?mock=true` funciona en todos los endpoints con la BD vacía
- [ ] Registro → login → `GET /usuarios/me` con token
- [ ] `seed.py` deja la BD demo-perfecta en una corrida
- [ ] Completar una quest sube `resiliencia_equipo`
- [ ] La API desplegada responde desde el celular en red distinta
- [ ] Cada request loggea su tiempo de respuesta

## 9. Si falta tiempo, se corta en este orden

1. 🥇 Bloques 1 y 2 — API completa con datos reales. Desbloquea a medio equipo
2. 🥈 Bloque 5 — deploy. Un demo en localhost es un demo frágil
3. 🥉 Bloque 3 — auth y Supabase
4. 🏅 Bloque 4 — quests con puntaje
5. ❌ pgvector, roles finos, refresh tokens, colas, webhooks, multi-oficina real
