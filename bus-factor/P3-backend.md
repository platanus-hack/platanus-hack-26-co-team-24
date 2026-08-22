# 🔌 P3 — Backend, Base de Datos y Auth
### Bus Factor HQ · Documento individual de trabajo

**Tu misión:** ser el punto de encuentro de todo. Los frontends SOLO hablan contigo; tú orquestas al cerebro y guardas el estado. Si tu API está estable y documentada desde temprano, la integración del equipo es trivial. Eres también el dueño del login y las oficinas.

---

## 1. Tu contrato con el equipo

Una **API REST en FastAPI** (Swagger automático en `/docs` = tu documentación viva):

```
POST /auth/registro            { email, password, nombre }
POST /auth/login               → token (Supabase Auth)
GET  /oficina                  → miembros con avatar_config y risk_score
PUT  /usuarios/me/avatar       { avatar_config }
POST /conexiones               { tipo: slack|drive }  (estado simulado)
GET  /conocimiento             → KnowledgeItem[] (filtros: persona, tipo)
GET  /riesgo                   → RiskScore[] por persona
GET  /escenarios               → catálogo de los 7 escenarios
POST /simular                  { scenario_id, objetivo_id } → SimulationResult
GET  /digest                   → Quest[] de la semana
PUT  /quests/{id}              { estado: completada } → nuevo puntaje equipo
```

- **Consumes:** el módulo de P2 (`extraer`, `calcular_riesgo`, `simular`, `generar_digest`).
- **Te consumen:** P4 (juego) y P5 (dashboard).

## 2. Orden de trabajo

### Fase 0 (Hora 0-1): contratos
Tú **escribes el README de contratos** (esquemas JSON + rutas de arriba). Eres el guardián: cualquier cambio pasa por ti y se versiona.

### Fase 1 (Hora 1-2): proyecto y BD
1. Crea el proyecto FastAPI en el monorepo (`/backend`), con CORS abierto para los frontends.
2. Supabase: habilita pgvector; crea tablas `offices, users, connections, knowledge_items, risk_scores, quests, simulations`. Usa el SQL editor de Supabase, no migraciones formales.

### Fase 2 (Hora 2-3): API FALSA COMPLETA ⚡
**Tu entrega más importante de todo el hackathon:** TODOS los endpoints de arriba respondiendo datos hardcodeados que cumplen el contrato (los 9 miembros, scores inventados, un playbook de ejemplo escrito a mano, 4 quests). 
- Avisa a P4 y P5 apenas esté desplegada (Railway/Render) o corriendo en tu máquina con la URL compartida.
- Desde este momento los frontends desarrollan contra ti sin esperar a nadie.

### Fase 3 (Hora 3-6): auth real
1. Supabase Auth para registro/login por email+contraseña; tu API valida el JWT.
2. Al registrarse, el usuario se asocia a la Oficina demo (una sola oficina hardcodeada está bien).
3. `PUT /avatar` persiste el `avatar_config` (JSON libre: `{cuerpo, peinado, ropa, colores}` — el formato lo define P4, tú solo lo guardas).
4. `POST /conexiones` **simulado**: marca la conexión como activa sin OAuth real (el flujo real de 1-2 cuentas es responsabilidad de P1 en las fuentes; tú solo reflejas el estado).

### Fase 4 (Hora 8-12): conectar el cerebro real — Cita H3 con P2
1. Endpoint interno `POST /admin/procesar`: lee los RawEvents de P1, llama `extraer()` y `calcular_riesgo()` de P2, persiste todo. Se corre manualmente, no montes colas ni schedulers.
2. `POST /simular` pasa de datos falsos a llamar `simular()` real. **Mantén un flag `?mock=true`** que devuelve la respuesta falsa — es tu plan B del demo si algo se cae en vivo.
3. `GET /digest` igual: real con fallback mock.

### Fase 5 (Hora 12-16): pulir para los frontends — Cita H4
Acompaña a P4 y P5 en el cambio de URL falsa → real. Ajusta formatos donde haya fricción (tú cedes, ellos no: los frontends son lo que se ve).

## 3. Qué tener en cuenta

- **El flag `?mock=true` en TODOS los endpoints críticos** es tu regalo al demo: pase lo que pase, el show continúa.
- No inventes microservicios: un solo FastAPI, un solo repo, un solo deploy.
- Loggea cada request con su tiempo de respuesta — cuando algo falle en integración, tu log resuelve la discusión en segundos.
- Semillas (`/backend/seed.py`): script que borra y repuebla la BD con el estado demo perfecto. Lo correrás veinte veces; hazlo desde la Fase 2.
- Auth ligera: protege lo de usuario (`/me`, quests), deja lecturas generales sin auth si eso acelera a los frontends. Es hackathon, no banca.

## 4. Qué probar (tu checklist)

- [ ] Hora 2-3: los 11 endpoints falsos responden y Swagger los muestra
- [ ] P4 y P5 confirmaron que consumen tu API falsa (¡pregúntales, no asumas!)
- [ ] Registro → login → `GET /oficina` con token funciona de corrido
- [ ] `seed.py` deja la BD demo-perfecta en una corrida
- [ ] **Cita H3:** `/admin/procesar` sobre datos reales llena la BD y `/simular` devuelve playbook real
- [ ] `?mock=true` funciona en `/simular` y `/digest` incluso con la BD vacía
- [ ] La API desplegada responde desde el celular (red distinta) — prueba de que el demo no depende de tu localhost

## 5. Prioridades si falta tiempo

1. 🥇 API falsa completa (Hora 2-3) — desbloquea a medio equipo
2. 🥈 `/simular` real con fallback mock
3. 🥉 Auth (registro/login/avatar)
4. 🏅 `/digest` y quests con puntaje
5. ❌ Roles/permisos finos, refresh tokens, colas, webhooks — no
