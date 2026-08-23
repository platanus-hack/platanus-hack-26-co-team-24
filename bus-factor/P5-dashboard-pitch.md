# 📊 P5 — Dashboard, Datos de Demo y Pitch
### Bus Factor HQ · Documento individual de trabajo

**Tu misión doble:** (a) las pantallas "serias" del producto — digest, quests, playbook, puntaje — y (b) que el demo de 3 minutos salga perfecto: datos sembrados, guion, deck y ensayos. Eres además el **pegamento con autoridad de recorte**: si a la Hora 16 algo amenaza el demo, tú decides cortarlo y nadie debate.

---

## 1. Tu contrato con el equipo

- **Consumes SOLO la API de P3**: `GET /digest`, `PUT /quests/{id}`, `GET /riesgo`, `GET /conocimiento`, y el `SimulationResult` que el juego dispara.
- **Entregas:** rutas React `/digest`, `/playbook`, `/equipo` + el paquete de demo (datos sembrados, guion, deck, plan B).
- Compartes app React con P4 (mismo repo `/frontend`, rutas distintas). Tailwind para ti; el canvas es de él.

## 2. Orden de trabajo

### Fase 1 (Hora 1-3): datos de demo (¡esto es urgente, no decorativo!)
Escribe **la historia sintética del equipo** que alimentará todo: define en un doc corto los 9 miembros (con el equipo real como base), quién es el punto único de falla (ej. "Ana: única con acceso al CRM y la que compra vuelos — al jefe solo le gusta LATAM"), 3-4 dependencias cruzadas, y las conversaciones/commits que lo evidencian. **Entrégaselo a P1 en la Hora 2** para que sus mocks y el workspace de prueba cuenten ESA historia. Si los datos no cuentan una historia, el demo no emociona — por eso esto va primero que tus pantallas.

### Fase 2 (Hora 3-8): pantallas contra la API falsa de P3
1. **`/digest` — el viernes:** lista de quests con asignado, acción, puntos, botón "Completar" (→ `PUT /quests`), y el **puntaje de resiliencia del equipo** grande arriba con barra de progreso. Estética: mezcla de dashboard limpio + toques arcade (fuente pixel en títulos, iconos 8-bit).
2. **`/playbook`:** render bonito del `playbook_md` (react-markdown + estilos: encabezados claros, bloques de "regla tácita" resaltados en amarillo). Botones: copiar / descargar.
3. **`/equipo`:** tarjetas por persona con score, color y sus items críticos (mismo dato que el juego, otra vista).

### Fase 3 (Hora 6-10): guion del demo y deck
1. **Guion de 3 minutos** partiendo del pitch del documento maestro, con marcas exactas: quién habla, qué se clickea, cuántos segundos por pantalla. El clímax: simular la renuncia en el juego → animación → playbook en tu pantalla mostrando el detalle de LATAM.
2. **Deck de máximo 6 diapositivas** (problema, solución, demo en vivo, diferenciador, mercado, roadmap). El deck acompaña, el demo protagoniza.
3. Define el **plan B por capas**: API cae → flag `?mock=true` de P3; internet cae → todo corriendo en localhost con datos sembrados; el juego crashea → video grabado del flujo (grábalo en el ensayo de la Hora 21).

### Fase 4 (Hora 14-16): cambio a API real — Cita H4
Cambias URL base con P3. Verifica sobre todo el playbook real: si Claude generó algo flojo, trabaja con P2 para afinar el prompt — tú eres los ojos del jurado.

### Fase 5 (Hora 16-23): QA general y ensayos (aquí mandas tú)
1. **Hora 16 — revisión de recorte:** recorre el flujo completo y decide qué se corta. Criterio único: *¿se ve en los 3 minutos?*
2. **Hora 20 — congelamiento:** verifica que nadie meta features nuevas.
3. **Hora 21-23 — ensayo general ×3 con cronómetro:** demo completo, cada persona en su rol. Graba el video de respaldo en el mejor ensayo. Prueba en la pantalla/proyector real si el evento lo permite.
4. Prepara respuestas a las 5 preguntas probables del jurado: privacidad de los datos, costo de la IA, qué pasa con empresas grandes, por qué no lo hace Notion/Slack, modelo de negocio.

## 3. Qué tener en cuenta

- **Tú defines el estándar visual de "serio con alma arcade"** — compártelo con P4 (misma paleta, misma fuente pixel en títulos) para que juego y dashboard se sientan un solo producto.
- El playbook debe leerse en 10 segundos desde la distancia del jurado: jerarquía tipográfica generosa, nada de párrafos densos.
- No construyas pantallas que no salen en el demo (settings, perfil, listados infinitos). Cada hora tuya en pantallas invisibles es una hora menos de ensayo.
- Ten los datos sembrados versionados (el `seed.py` de P3 nace de TU historia — revísalo con él).

## 4. Qué probar (tu checklist)

- [ ] Hora 3: la historia sintética está en manos de P1 y P3
- [ ] Hora 8: `/digest` y `/playbook` funcionan contra la API falsa
- [ ] Completar una quest sube el puntaje visiblemente (momento demoable)
- [ ] **Cita H4:** pantallas contra API real; el playbook real menciona LATAM
- [ ] El flujo completo juego→panel→playbook corre 3 veces sin tocar código
- [ ] Video de respaldo grabado y probado en el equipo que presentará
- [ ] Demo cronometrado ≤ 3 minutos en los 3 ensayos

## 5. Prioridades si falta tiempo

1. 🥇 Historia sintética de datos (Hora 1-3) — sin ella nada emociona
2. 🥈 `/playbook` hermoso — es el entregable estrella
3. 🥉 Guion + ensayos + plan B — un demo ensayado gana a un feature más
4. 🏅 `/digest` con quests interactivas
5. ❌ `/equipo`, exportaciones, animaciones de dashboard — recortables sin dolor
