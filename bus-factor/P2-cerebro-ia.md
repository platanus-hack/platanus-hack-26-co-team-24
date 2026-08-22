# 🧠 P2 — Cerebro IA
### Bus Factor HQ · Documento individual de trabajo

**Tu misión:** convertir eventos crudos en conocimiento estructurado, medir el riesgo, simular emergencias y generar los entregables estrella del demo: el **playbook de empalme** y las **quests del viernes**. Eres el "wow" técnico del proyecto.

---

## 1. Tu contrato con el equipo

- **Consumes:** `RawEvent[]` de P1 (archivo JSON o endpoint — acuérdenlo en Hora 0).
- **Entregas a P3** cuatro funciones (como módulo Python que P3 importa, o como micro-endpoints — módulo importable es más simple):

```python
extraer(raw_events) -> list[KnowledgeItem]
calcular_riesgo(items) -> list[RiskScore]        # por persona, 0-100
simular(scenario, items) -> SimulationResult     # huérfanos + playbook_md
generar_digest(items, scores) -> list[Quest]     # las misiones del viernes
```

- **Nunca hablas con los frontends.** Todo pasa por la API de P3.

## 2. Orden de trabajo

### Fase 0 (Hora 0-1): contratos
Define con todos el esquema `KnowledgeItem` (tipo: `tarea | acceso | regla_tacita | proceso`; campos: `descripcion`, `dueño_principal`, `respaldos[]`, `fuente`, `evidencia`). Pelea por que `respaldos[]` exista desde el día uno: el bus factor ES ese campo.

### Fase 1 (Hora 1-3): esqueleto con datos falsos
Escribe las 4 funciones devolviendo **datos hardcodeados** que cumplan el contrato. Entrégaselas a P3 de inmediato. Ya desbloqueaste la cadena.

### Fase 2 (Hora 2-8): extracción real con Claude
El corazón. Un solo prompt bien afinado por lotes de eventos:

```
Eres un analista de continuidad organizacional. De los siguientes
eventos de {fuente}, extrae elementos de conocimiento en JSON.
Tipos: tarea, acceso, regla_tacita, proceso.
Para cada uno: descripcion (concreta), dueño_principal (email),
respaldos (emails de otros que demuestren conocerlo, según los
eventos), evidencia (cita textual corta del evento).
Reglas tácitas = preferencias y normas no escritas
(ej: "al jefe solo le gusta viajar en LATAM").
Responde SOLO un array JSON, sin markdown ni preámbulo.
```

- Procesa en lotes de 15-25 eventos (por tamaño de contexto y para que la evidencia sea rastreable).
- Parsea defensivamente: quita fences ```json, reintenta 1 vez si el JSON falla.
- **Deduplicación:** tras extraer todo, un segundo pase con Claude fusionando items similares (mismo dueño + descripción parecida). Con volumen de hackathon basta este pase LLM, no montes similitud coseno para esto.

### Fase 3 (Hora 6-10): embeddings + scoring
- Vectoriza `descripcion + evidencia` de cada item en pgvector (Supabase de P3). Los embeddings sirven para el retrieval del playbook, no para el score.
- **Score de riesgo por persona (fórmula simple y explicable):**
  - Por cada item donde es `dueño_principal`: +peso según tipo (acceso=3, proceso=2, tarea=1, regla_tacita=2)
  - Si `respaldos` está vacío: ese item multiplica ×2 (¡bus factor 1!)
  - Normaliza a 0-100 sobre el máximo del equipo
- Guarda también `items_criticos[]` (los que tienen respaldos vacíos) — el frontend los pinta en rojo.

### Fase 4 (Hora 8-14): simulación + playbook
`simular(scenario)`:
1. Filtra los items afectados (persona → sus items; GitHub caído → items con fuente/metadata github; robo PC → items tipo `acceso` del objetivo).
2. Con retrieval de los items afectados + evidencia, pide a Claude el **playbook en Markdown**: qué hacía, cómo lo hacía, reglas tácitas a respetar, quién debe asumir cada cosa (elige respaldos si existen; si no, sugiere al más cercano por co-participación), primeras 48 horas.
3. Devuelve `SimulationResult { items_huerfanos, impacto, playbook_md }`.

**El playbook es LA diapositiva del demo. Púlelo hasta que emocione.** Debe incluir el detalle de LATAM si está en los datos.

### Fase 5 (Hora 12-16): digest y quests
`generar_digest()`: toma los 5-8 items más críticos y pide a Claude una quest por item: `{ asignado_a, accion, puntos }`. Acción imperativa y concreta: *"David: comparte el acceso del servidor con Samuel y documéntalo en Notion"*.

## 3. Qué tener en cuenta

- **Temperatura baja (0-0.3)** en extracción; un poco más alta en playbook para que narre bien.
- **Costo/latencia:** cachea resultados de extracción en disco/BD. En el demo NO re-extraes: solo `simular()` corre en vivo (eso sí debe verse en tiempo real, 5-15 seg está perfecto — P5 lo cubre con la animación).
- **Todo en español**, prompts y salidas — el jurado leerá el playbook.
- Si Claude alucina dueños, refuerza en el prompt: "usa SOLO emails presentes en los eventos".

## 4. Qué probar (tu checklist)

- [ ] Las 4 funciones con datos falsos pasan y P3 las consume (Hora 3)
- [ ] Extracción sobre los mocks de P1 detecta la regla tácita sembrada (LATAM) — es tu caso de prueba canónico
- [ ] **Cita H2 (Hora 6-8) con P1:** extracción sobre Slack real produce dueños coherentes
- [ ] Score: la persona sembrada como "punto único de falla" sale con el score más alto
- [ ] **Cita H3 (Hora 10-12) con P3:** `POST /simular` de punta a punta devuelve playbook legible
- [ ] Simular 3 escenarios distintos sin que el JSON se rompa nunca

## 5. Prioridades si falta tiempo

1. 🥇 Extracción + playbook de "renuncia de persona" — es EL demo
2. 🥈 Score de riesgo (colores de la oficina)
3. 🥉 Quests del viernes
4. 🏅 Escenarios de infraestructura (GitHub caído, robo)
5. ❌ Deduplicación sofisticada, fine-tuning, evaluaciones — no existen en hackathon
