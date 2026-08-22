# Rediseño "Synth Dusk" del frontend P4 · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Aplicar la guía de arte de Claude Design (`docs/design/guia-visual.dc.html`, texto en `docs/design/guia-visual.txt`) al frontend existente sin reescribir el motor: mismos 16 px de tile y sprites 16×24, nueva paleta, tipografía, HUD, auras, paneles y reglas de movimiento.

**Architecture:** Tokens únicos en `src/game/palette.ts` (THEME) y en `scripts/gen-assets.mjs` (COLORS, espejo). CSS de UI en `src/ui/ui.css` con variables `--dusk-*`. Fuentes Google (Workbench, Jersey 15, VT323) cargadas en `index.html`. Phaser usa `Phaser.GameObjects.Text` con `fontFamily: 'VT323'` para etiquetas en escena.

**Spec:** `docs/design/guia-visual.txt` (autoridad) · Base de código: rama `p4/adaptador-api-p3`.

## Global Constraints (de la guía)

- 11 colores, nada fuera de la lista: VOID `#120A20`, BASE `#1A0F2E`, SURFACE `#241543`, LINE `#43276B`, TURQUESA datos `#2BD9D0`, ROSA acción `#FF4D9D`, LIMA vivo `#B6FF3C`, ORO puntaje `#FFD166`, NARANJA luz cálida `#FF7A2F`, LILA mobiliario `#A98BFF`, MORADO sala de juntas `#7B3FE4`, ROJO solo emergencia `#FF2E63`, texto `#F3E8FF`, texto secundario `#A98CD6`.
- Un color, un papel: turquesa nunca es botón; rosa nunca es dato; lima = "funciona"; rojo solo en emergencia activa o riesgo ≥ 70.
- Dos fondos: BASE para escena, SURFACE para paneles. Sin degradados en la UI, sin bordes redondeados (solo círculos de aura), sin sombras suaves grandes; sombras duras (`box-shadow: 7px 7px 0 #120A20`) y glows puntuales permitidos.
- Tipografía: Workbench solo títulos/logo (≥32 px). Jersey 15 cuerpo (22/24/30). VT323 etiquetas/HUD/cifras/código, MAYÚSCULAS con tracking (17/20/24). Mínimo 17 px en juego; 22 px en el panel de resultado. Máx. 2 tipografías por pantalla del juego.
- Auras: 0–39 lima estática; 40–69 oro "respiración" 3 s; 70–100 rojo pulso 1,4 s + etiqueta flotante `NOMBRE 87` (solo riesgo alto).
- Movimiento: caminar 64 px/s lineal; nunca más de 3 personajes moviéndose a la vez, desfases 2–4 s; panel entra deslizando 24 px desde abajo, 220 ms ease-out, solo cuando terminó la animación (3–5 s); titileo de pantallas con `steps(2)`.
- Cada personaje: pelo único + ropa única (pares de la guía). Sentado conserva el aura.
- Fuera de alcance: `/login`, Digest (P5), cambio de grilla a 32 px.

---

### Task A: Tokens, tipografía y assets (base de todo)

**Files:** `src/game/palette.ts`, `scripts/gen-assets.mjs`, `index.html`, `src/index.css`, `src/ui/ui.css` (variables), `src/game/config.ts`, `src/game/risk.ts` + test

- [ ] `palette.ts`: reemplazar THEME por los 11 colores + texto (nombres: `void, base, surface, line, turquesa, rosa, lima, oro, naranja, lila, morado, rojo, texto, texto2`). Mantener claves usadas hoy como alias (`bg`=base, `riskLow`=lima, `riskMid`=oro, `riskHigh`=rojo, `wall`, `floorA/B`, `desk`, `chair`, `server`, `coffee`, `meeting`, `console`) apuntando a la nueva paleta. `PALETTE` (tints de ropa) → `{ blue:turquesa, red:rosa, green:lima, yellow:oro, purple:morado, gray:lila }` y añadir `HAIR_PALETTE` con los mismos 6 + `orange:naranja`. Exportar `PAIRS: [hair, clothes][]` con los 9 pares de la guía (turquesa+rosa, naranja+lima, lila+turquesa, oro+morado, rosa+oro, morado(ciruela)+naranja, lima+lila, oro(rubio)+morado, morado+naranja) como claves de `HAIR_PALETTE`/`PALETTE`.
- [ ] `gen-assets.mjs`: COLORS espejo. Piso = damero BASE / `#1E1140`; muro LINE con borde SURFACE; escritorio LILA con borde VOID; silla MORADO; monitor ON turquesa con core claro, OFF `#3A1959`; rack lima (LEDs) sobre SURFACE, rack OFF rojo; cafetera NARANJA; mesa de juntas MORADO; consola ROSA con borde `#F3E8FF`; lámpara ORO; pelo de personajes en GRIS CLARO `#d8d8d8` (tintable) y ropa igual; piel `#E8B98A` / `#8A5C3E`. Regenerar.
- [ ] `index.html`: `<link>` a Google Fonts `Workbench`, `Jersey+15`, `VT323` (`display=swap`). `index.css`: body BASE, `font-family: 'Jersey 15', monospace`, `font-size: 22px`. `ui.css`: `:root { --void… --texto2 }`.
- [ ] `config.ts` backgroundColor = THEME.void (fuera de la sala = VOID).
- [ ] `risk.ts` sigue derivando de THEME; test actualizado a los nuevos hex (`0xB6FF3C`, `0xFFD166`, `0xFF2E63`).
- [ ] Captura `/oficina`: debe verse ciruela profunda + lila/morado + turquesa, sin azul marino anterior.
- [ ] Commit: `feat(art): paleta Synth Dusk, tipografías y assets`

### Task B: Personajes y auras según guía

**Files:** `src/game/Character.ts`, `src/game/OfficeScene.ts`, `src/game/behavior.ts` (+test), `src/api.ts` (mock mapping)

- [ ] Pares pelo+ropa: en `Character` tintar `hair` con `HAIR_PALETTE[pair[0]]` y `clothes` con `PALETTE[pair[1]]`. El par sale de `PAIRS[person.desk % 9]` salvo que `avatar_config` venga del editor (usuario demo) — en ese caso ropa = `avatar_config.paleta` y pelo = el par. Sin dos personajes con el mismo par.
- [ ] Auras: `setRisk`: bajo → lima alpha .55 estático (sin tween); medio → oro con tween alpha .35↔.8, 3000 ms yoyo repeat −1 Sine; alto → rojo alpha .3↔.9, 700 ms yoyo (ciclo 1,4 s), radio 9, **más etiqueta flotante** `Phaser.Text` `"${NOMBRE.toUpperCase()} ${score}"` VT323 17 px color ROJO con stroke VOID 3 px, 12 px sobre la cabeza, tween y −3 yoyo 1400 ms; guardarla en el container y destruir en `destroy()`. Solo riesgo alto lleva etiqueta.
- [ ] "La sala respira": en `OfficeScene` un contador `moving` compartido; `Character.tick()` solo inicia un `walkTo` si `scene.moving < 3`, si no espera 2–4 s y reintenta. Desfase inicial 2–4 s (ya hay 0–3 s: subir a 2–4). `behavior.test.ts` añade test de `durationMs` y un test puro de `canMove(moving)` (`moving < 3`).
- [ ] Titileo de pantallas: anims `pc`/`server`/`meet` con `frameRate` 2 y `repeat −1` (ya); asegurar que no se usa alpha continua.
- [ ] Commit: `feat(game): pares de color por personaje, auras por nivel y sala que respira`

### Task C: HUD, tooltip, consola y botón (React)

**Files:** `src/ui/GameCanvas.tsx`, `src/ui/Hud.tsx` (nuevo), `src/ui/RiskTooltip.tsx`, `src/ui/ArcadeConsole.tsx`, `src/ui/MuteButton.tsx`, `src/ui/ui.css`, `src/api.ts` (exponer `resiliencia_equipo` en `Oficina` como `resiliencia?: number`; mock 64)

- [ ] `Hud.tsx` arriba-izquierda: `OFICINA <NOMBRE>` (VT323 20 px turquesa, tracking 3 px) + `9 PERSONAJES`; arriba-derecha: tarjeta SURFACE con borde LINE `RESILIENCIA` + cifra ORO 38 px (Workbench no: usar VT323 38) + `▲12` lima (mock). Mute: botón `🔊 CHIPTUNE` VT323 17 px, borde LINE, sin radio.
- [ ] Consola (botón): abajo-derecha, ROSA, texto `🕹️ CONSOLA` VT323 24 px `#F3E8FF`, borde 3 px `#F3E8FF`, `box-shadow: 7px 7px 0 #120A20`, sin radio; hover translate(−2,−2). Es el único elemento con ese tratamiento.
- [ ] Panel consola: SURFACE, borde 3 px LINE, título `CONSOLA DE EMERGENCIAS` (Workbench 32) + `7 ESCENARIOS` (VT323 17 texto2); lista de 7 con nombre en VT323 22 MAYÚSCULAS y descripción Jersey 22 texto2; item seleccionado borde turquesa; selector `PERSONA` (label VT323) con `<select>` estilizado (SURFACE, borde LINE); botón `SIMULAR ▶` ROSA estilo botón primario (borde blanco, sombra dura 4 px). Entra deslizando 24 px desde abajo 220 ms ease-out (CSS keyframes, sin rebote).
- [ ] Tooltip: SURFACE, borde 3 px turquesa, nombre Workbench 32, `OPS · OFICINA <NOMBRE>` VT323 17 texto2, cifra de riesgo 56 px VT323 color según nivel + `riesgo` debajo, sección `SOLO ELLA/ÉL SABE HACER ESTO` (VT323 17 turquesa) y lista con etiqueta de tipo (`TAREA`/`TÁCITO`/`ACCESO`/`ITEM`) en VT323 17 sobre chip LINE, descripción Jersey 22. Botón `×` arriba-derecha. Sin radios.
- [ ] Commit: `feat(ui): HUD, tooltip y consola Synth Dusk`

### Task D: Panel de resultado y editor de avatar

**Files:** `src/ui/ResultPanel.tsx`, `src/ui/AvatarEditor.tsx`, `src/ui/ui.css`, `src/game/OfficeScene.ts` (medir duración), `src/api.ts` (`IS_MOCK` ya existe)

- [ ] Panel resultado: entra **después** de terminar la animación (ya), deslizando 24 px 220 ms. Cabecera: `SIN <NOMBRE> · <ROL>` (Workbench 38), chip `RESULTADO SIMULADO (DEMO)` (VT323 17, borde ORO) cuando `IS_MOCK`, chip `GENERADO EN X,X S` (medir en `onScenarioStart` con `performance.now()` y pasarlo en el evento `scenario:result` como `{ result, ms }`). 3 tiles: cifra VT323 56 ORO + leyenda Jersey 22 texto2 (ocultar tiles sin valor). Sección `QUÉ QUEDA SIN DUEÑO` con lista de chips de tipo + Jersey 24. Sección `PLAYBOOK GENERADO` + chip `MARKDOWN`, `<pre>` VT323 20 sobre VOID con borde LINE. Botones: `RESTAURAR OFICINA` LIMA (texto VOID, borde blanco, sombra dura) y `DESCARGAR .MD` secundario (borde LINE) que crea un blob `text/markdown` y dispara descarga `empalme-<id>.md`. Nada por debajo de 22 px salvo chips 17.
- [ ] Error: mismo panel con título `ERROR CONECTANDO A LA API` ROJO y botón `CERRAR`.
- [ ] Editor: tarjeta SURFACE borde LINE, título `TU AVATAR` Workbench 38 y chip `GUARDADO ✓` **en el encabezado** (VT323 17 lima, aparece 2,5 s con salto de 4 px: keyframe translateY(4px→0) 120 ms). Labels VT323 17 MAYÚSCULAS; `<select>` estilizados; color como 6 swatches cuadrados (radio 0) con borde blanco en el activo; botones `GUARDAR` ROSA primario y `IR A LA OFICINA ▶` secundario LIMA borde.
- [ ] Commit: `feat(ui): panel de resultado y editor de avatar Synth Dusk`

### Task E: Estados de emergencia según guía

**Files:** `src/game/scenarios/{roboPc,generic,github,renuncia}.ts`, `src/game/scenarios/fx.ts`

- [ ] Robo PC: ocultar PC y dibujar **hueco punteado** (`Graphics` rectángulo 16×16 con `lineStyle(1, ROSA)` en trazos: 4 segmentos por lado), haz rojo giratorio (ya) y **candado oro**: `Text` `🔒` 12 px o rectángulo ORO 6×8 con arco, flotando (usar `floatIcon` con tint ORO sobre el frame 11 si no hay glifo).
- [ ] Apagón: overlay VOID alpha .55 (≈45 % luminosidad) sobre todo; monitores y auras por encima (depth); rack → frame OFF y LEDs sin color (tint `#3A1959`).
- [ ] GitHub: rack tint ROJO, humo en **dos tiempos** (emitter 1,2 s, pausa 0,6 s, emitter otra vez), exactamente 2 devs se levantan con `?` flotante (`floatIcon`) sobre la cabeza y caminan al rack.
- [ ] Renuncia: escritorio gris = tint LINE (no `#777`); iconos `?` tint ORO.
- [ ] Todas las animaciones 3–5 s (renuncia hasta 8 s aceptado por la caminata); panel solo al terminar.
- [ ] Commit: `feat(game): estados de emergencia según la guía`

### Task F: Verificación visual y README

- [ ] Capturas 1366×768 de: oficina, tooltip Ana, consola, renuncia mid-walk, resultado, robo PC, apagón, github, avatar. Compararlas con la guía (sección 05–08) y corregir desvíos obvios de color/tipografía.
- [ ] README › Frontend: sección "Dirección de arte" con link a `docs/design/guia-visual.dc.html` y los 11 colores.
- [ ] Commit: `docs: guía visual Synth Dusk`
