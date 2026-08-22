# P4 — Frontend Juego (oficina viva) · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Oficina pixel art en Phaser dentro de React (`/oficina`) + editor de avatar (`/avatar`), consumiendo la API de P3 (mock primero, real en H4), con el escenario "renuncia" impecable.

**Architecture:** App Vite+React+TS en `frontend/`. Un `api.ts` único con `fetch` que, si `VITE_API_URL` está vacío, devuelve JSON mock local (mismo contrato). Phaser vive en un solo componente React; React⇄Phaser se comunican con un `Phaser.Events.EventEmitter` global (`bus`). Paneles, consola arcade y editor son React encima del canvas.

**Tech Stack:** Vite, React 18, TypeScript, react-router-dom, Phaser 3, easystarjs, Vitest, Prettier. Nada más sin justificación en el demo.

**Spec:** `../../../../P4-frontend-juego.md` y `../../../../bus-factor-hq-hackathon.md` (carpeta padre, fuera del repo).

## Global Constraints

- Solo se llama a la API de P3: `GET /oficina`, `GET /riesgo`, `GET /escenarios`, `POST /simular`, `PUT /avatar`. Jamás Slack/Claude/Supabase directo.
- `pixelArt: true`, zoom entero (2 o 3), sin escalados fraccionarios.
- 60 fps: tweens con easing, sin teleports, velocidad constante al caminar.
- El estado lo manda el servidor: el juego anima lo que la API dice.
- Secretos: el front solo usa variables `VITE_*` públicas. Nunca keys de Claude/Supabase en el front.
- Prioridad: 🥇 oficina viva + riesgo en colores → 🥈 renuncia → 🥉 editor avatar → 🏅 GitHub/robo PC → ❌ resto.
- Commits pequeños cada ≤2h, rama `p4/<tema>`, PR a `main`. Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`).
- Assets solo CC0/CC-BY (Kenney, LPC) con `ATTRIBUTION.md`.

---

## Contratos (acordar en H0 con P3 — copiar al README raíz como v1)

```jsonc
// GET /oficina
{ "office": { "id": "off_1", "nombre": "Inerxia" },
  "people": [ { "id": "p_ana", "nombre": "Ana", "rol": "Ops",
      "desk": 3,                                  // índice de escritorio 0-8
      "avatar_config": { "cuerpo": "light", "peinado": "long", "ropa": "shirt", "paleta": "blue" } } ] }

// GET /riesgo
{ "scores": [ { "person_id": "p_ana", "score": 87,
      "items_criticos": [ { "id": "k1", "tipo": "tarea", "descripcion": "Comprar vuelos del jefe" } ] } ] }

// GET /escenarios
{ "scenarios": [ { "id": "renuncia", "tipo": "persona", "nombre": "Renuncia / ausencia",
      "descripcion": "...", "requiere_persona": true } ] }

// POST /simular   body: { "scenario_id": "renuncia", "person_id": "p_ana" }
{ "scenario_id": "renuncia", "person_id": "p_ana",
  "items_huerfanos": [ { "id": "k1", "tipo": "tarea", "descripcion": "..." } ],
  "impacto": { "tareas": 7, "dias_recuperacion": 12, "score": 64 },
  "playbook_md": "# Empalme de Ana\n..." }

// PUT /avatar     body: { "cuerpo": "light", "peinado": "long", "ropa": "shirt", "paleta": "blue" }
// → 200 { "ok": true }
```

IDs de escenario: `renuncia` (completo), `github_caido`, `robo_pc`, `apagon`, `incendio`, `meet_caido`, `ransomware` (genérico = parpadeo rojo + panel).

## Estructura de archivos

```
frontend/
  .env.example              VITE_API_URL=            (vacío = mocks)
  public/assets/
    tiles/office.png  maps/office.json (Tiled)  sprites/*.png  audio/*.ogg  ATTRIBUTION.md
  src/
    main.tsx                router: /oficina, /avatar
    api.ts                  fetch + fallback a mocks (único punto de red)
    types.ts                tipos del contrato
    mocks/oficina.json riesgo.json escenarios.json simular.json
    bus.ts                  EventEmitter React⇄Phaser
    game/
      config.ts             Phaser.Game config
      OfficeScene.ts        tilemap, objetos, cámara, orquestación de escenarios
      Character.ts          sprite + aura + moveTo(path)
      pathfinding.ts        easystar sobre capa "collision"
      risk.ts               scoreToColor (puro, testeado)
      behavior.ts           FSM ambiental (puro, testeado)
      scenarios/renuncia.ts github.ts roboPc.ts generic.ts
    ui/
      GameCanvas.tsx        monta Phaser, cleanup en unmount
      ArcadeConsole.tsx     menú escenarios
      ResultPanel.tsx       resultado de /simular
      RiskTooltip.tsx
      AvatarEditor.tsx      /avatar
      MuteButton.tsx
```

---

### Task 0: Setup del proyecto + convenciones (Fase 0, hora 0-1)

**Files:** `frontend/*` (scaffold), `frontend/.env.example`, `README.md` (sección Frontend + contratos), `.gitignore`

- [ ] `npm create vite@latest frontend -- --template react-ts && cd frontend && npm i phaser easystarjs react-router-dom && npm i -D vitest prettier`
- [ ] `.env.example` con `VITE_API_URL=`; `.gitignore` con `.env`, `node_modules`, `dist`.
- [ ] `package.json` scripts: `"test": "vitest run"`, `"format": "prettier -w src"`. `.prettierrc`: `{ "semi": true, "singleQuote": true }`.
- [ ] README raíz: cómo correr (`cd frontend && npm i && npm run dev`), contratos v1, reglas de ramas/commits.
- [ ] Descargar assets (Kenney Office/Interior, LPC base+hair+clothes, 4 sonidos: puerta, alarma, humo, click) a `public/assets/` + `ATTRIBUTION.md`.
- [ ] Commit: `chore(frontend): scaffold vite+react+phaser, contratos y assets`

### Task 1: Cliente API con mocks (hora 1-2)

**Files:** `src/types.ts`, `src/api.ts`, `src/mocks/*.json`, `src/api.test.ts`

**Produces:** `getOficina(): Promise<Oficina>`, `getRiesgo(): Promise<Riesgo>`, `getEscenarios(): Promise<{scenarios: Scenario[]}>`, `simular(body): Promise<SimulationResult>`, `putAvatar(cfg): Promise<{ok: boolean}>`.

- [ ] `types.ts`: interfaces `AvatarConfig`, `Person`, `Oficina`, `RiskScore`, `Riesgo`, `Scenario`, `SimulationResult` calcadas del contrato.
- [ ] Mocks: 9 personas (Ana, David, Andrés, Brayan, Jorge + 4 ficticias), Ana con score 87, resto 20-65; `simular.json` con 7 items huérfanos y `playbook_md`.
- [ ] `api.ts`:

```ts
const BASE = import.meta.env.VITE_API_URL as string | undefined;

async function req<T>(path: string, mock: T, init?: RequestInit): Promise<T> {
  if (!BASE) return structuredClone(mock); // ponytail: sin VITE_API_URL = modo demo offline
  const r = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, ...init });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}

export const getOficina = () => req('/oficina', oficinaMock);
export const getRiesgo = () => req('/riesgo', riesgoMock);
export const getEscenarios = () => req('/escenarios', escenariosMock);
export const simular = (body: { scenario_id: string; person_id?: string }) =>
  req('/simular', simularMock, { method: 'POST', body: JSON.stringify(body) });
export const putAvatar = (cfg: AvatarConfig) =>
  req('/avatar', { ok: true }, { method: 'PUT', body: JSON.stringify(cfg) });
```

- [ ] `api.test.ts`: sin `VITE_API_URL`, `getOficina()` devuelve 9 personas y `simular({scenario_id:'renuncia'})` devuelve `playbook_md` no vacío. `npm test` verde.
- [ ] Commit: `feat(api): cliente único con fallback a mocks`

### Task 2: Oficina estática (Fase 1, hora 1-4)

**Files:** `src/game/config.ts`, `src/game/OfficeScene.ts`, `src/ui/GameCanvas.tsx`, `src/main.tsx`, `public/assets/maps/office.json`

- [ ] Tiled: mapa 40×25 tiles de 16px, capas `floor`, `walls`, `furniture`, `collision` (tile property `collides=true`), capa de objetos `points` con `desk_0..desk_8`, `coffee`, `meeting`, `door`, `server`, `console`, `meet_screen`, `cto_pc`. Exportar JSON.
- [ ] `config.ts`: `{ type: Phaser.AUTO, pixelArt: true, zoom: 2, width: 640, height: 400, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: [OfficeScene] }`.
- [ ] `OfficeScene.preload/create`: cargar tilemap, pintar capas, sprites animados de 2 frames (servidor parpadeando, PCs, cafetera, lámparas) en las posiciones de `points`.
- [ ] Cámara idle: `this.tweens.add({ targets: this.cameras.main, scrollX: 200, duration: 8000, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 })`.
- [ ] `GameCanvas.tsx`: `useEffect(() => { const g = new Phaser.Game({ ...config, parent: ref.current! }); return () => g.destroy(true); }, [])`.
- [ ] Checklist hora 4: oficina a 60 fps (`game.loop.actualFps` en consola).
- [ ] Commit: `feat(game): oficina estática con objetos animados`

### Task 3: Personajes vivos (Fase 2, hora 3-6)

**Files:** `src/game/pathfinding.ts`, `src/game/Character.ts`, `src/game/behavior.ts`, `src/game/behavior.test.ts`, `src/bus.ts`

**Produces:** `Character.moveTo(point: string): Promise<void>`, `Character.play(anim: 'sit'|'type'|'idle'|'stand'|'walk_up'|'walk_down'|'walk_left'|'walk_right')`, `nextState(r?: number): State`, `durationMs(state: State): number`.

- [ ] `bus.ts`: `export const bus = new Phaser.Events.EventEmitter();` Eventos: `scenario:start`, `scenario:result`, `scenario:error`, `person:click`.
- [ ] `pathfinding.ts`: easystar con grid de `collision` (0 libre / 1 bloqueado), `setAcceptableTiles([0])`, `findPath(from, to): Promise<{x:number,y:number}[]>`.
- [ ] `behavior.ts` (puro):

```ts
export type State = 'trabajando' | 'cafe' | 'reunion' | 'caminar';
const WEIGHTS: [State, number][] = [['trabajando', 0.7], ['cafe', 0.1], ['reunion', 0.15], ['caminar', 0.05]];
export function nextState(r = Math.random()): State {
  let acc = 0;
  for (const [s, w] of WEIGHTS) { acc += w; if (r < acc) return s; }
  return 'trabajando';
}
export const durationMs = (_: State, r = Math.random()) => 4000 + r * 8000;
```

- [ ] `behavior.test.ts`: 10 000 muestras de `nextState()` → `trabajando` entre 0.67 y 0.73; `nextState(0.99)` es `caminar`.
- [ ] `Character.ts`: `Phaser.GameObjects.Container` con aura (círculo) + sprite. `moveTo` recorre el path con un tween por celda, velocidad constante (`duration = 16 / speed * 1000`), `ease: 'Linear'`, gira el sprite al dir antes de cada tramo. Loop: `state = nextState()` → `moveTo(punto del estado)` → `play(anim)` → `delay(durationMs)` → repeat. `stopBehavior()` para los escenarios.
- [ ] `OfficeScene`: `getOficina()` → spawn 9 `Character` en su `desk_N`. Escuchar `bus.on('scenario:start')`.
- [ ] Checklist hora 6: nadie atraviesa muebles; si dos comparten celda, offset de 2px por índice (ponytail: sin evitación dinámica; añadir si se ve feo en el demo).
- [ ] Commit: `feat(game): personajes con pathfinding y comportamiento ambiental`

### Task 4: Riesgo visible + tooltip (Fase 3a, hora 5-6)

**Files:** `src/game/risk.ts`, `src/game/risk.test.ts`, `src/ui/RiskTooltip.tsx`

- [ ] `risk.ts`: `scoreToColor(s)` → `0x4ade80` (≤40), `0xfacc15` (≤70), `0xef4444`; `isCritical = (s) => s > 70`. Test de bordes 40/41/70/71.
- [ ] Character: aura tint según score; si crítico, tween `alpha 0.3↔0.9, yoyo, repeat:-1`.
- [ ] Click en personaje → `bus.emit('person:click', { id, nombre, score, items_criticos })` → `RiskTooltip` lo muestra; cerrar con Esc/click fuera. Texto plano, nunca `dangerouslySetInnerHTML`.
- [ ] Checklist: cambiar score en `riesgo.json` cambia el color.
- [ ] Commit: `feat(game): aura de riesgo y tooltip`

### Task 5: Editor de avatar (Fase 3b, hora 6-8)

**Files:** `src/ui/AvatarEditor.tsx`

- [ ] 4 `<select>` nativos (cuerpo/peinado/ropa/paleta) con opciones fijas según los sprites LPC descargados. Preview = 4 `<img>` apiladas con `position:absolute; image-rendering:pixelated`, animación de caminar con CSS `steps()` sobre el spritesheet.
- [ ] Guardar → `putAvatar(cfg)` + `localStorage.setItem('avatar', JSON.stringify(cfg))` (ponytail: localStorage solo para que el modo mock sobreviva recarga; la API real persiste).
- [ ] `OfficeScene` compone el sprite de cada personaje con las mismas capas según `avatar_config` (dibujar capas a un `RenderTexture` una vez por personaje). Si `localStorage.avatar` existe y no hay `VITE_API_URL`, sobreescribe el del usuario actual (`p_ana`).
- [ ] Checklist: crear avatar → recargar → el personaje lo luce.
- [ ] Commit: `feat(avatar): editor por capas LPC`

### Task 6: Escenario "Renuncia" ⭐ + consola + panel (Fase 4.1/4.7, hora 8-11)

**Files:** `src/game/scenarios/renuncia.ts`, `src/ui/ArcadeConsole.tsx`, `src/ui/ResultPanel.tsx`, `OfficeScene.ts`

- [ ] `ArcadeConsole`: `getEscenarios()` → lista; si `requiere_persona`, `<select>` de persona. Lanzar → `bus.emit('scenario:start', { scenario_id, person_id })`. Se abre al hacer click en el objeto `console` de la escena.
- [ ] `renuncia.ts`: `export async function run(scene: OfficeScene, char: Character)`: `char.stopBehavior()` → `play('stand')` → `await moveTo('door')` → tween `alpha: 0` → tint gris `0x777777` al escritorio → 3 iconos "?" con tween flotante `y: -6, yoyo, repeat: -1`. Duración 6-8 s. Sonido `door.ogg`.
- [ ] Orquestación en `OfficeScene`: en `scenario:start`, lanzar en paralelo `simular(body)` y `run(...)`; `await Promise.all` → `bus.emit('scenario:result', result)`. Si `simular` rechaza → `bus.emit('scenario:error', msg)` y restaurar oficina. Nunca se queda a medias en el demo.
- [ ] `ResultPanel`: items huérfanos, impacto, `playbook_md` en `<pre>` (ponytail: sin renderer markdown; si sobra tiempo, `react-markdown` sin HTML raw). Botón "Restaurar oficina" → `scene.scene.restart()`.
- [ ] Checklist: ejecutar 3 veces seguidas sin bugs.
- [ ] Commit: `feat(game): escenario renuncia, consola arcade y panel de resultado`

### Task 7: GitHub caído + robo PC + genérico (Fase 4.2-4.6, hora 11-14)

**Files:** `src/game/scenarios/github.ts`, `roboPc.ts`, `generic.ts`, `index.ts`

- [ ] `github.ts`: emitter de partículas gris sobre `server`, tint rojo en luces, personajes con `rol` dev `moveTo('server')` + `play('idle')`.
- [ ] `roboPc.ts`: ocultar sprite `cto_pc`, círculo rojo `alpha 0.3` rotando con tween `angle: 360, repeat: -1`, `alarm.ogg`.
- [ ] `generic.ts`: overlay rojo parpadeando 3 veces. `incendio` añade `scene.cameras.main.shake(500)` y todos `moveTo('door')`. `apagon`: overlay negro `alpha 0.85` con las pantallas encima (depth mayor).
- [ ] `index.ts`: `export const SCENARIOS: Record<string, Runner> = { renuncia, github_caido, robo_pc }`; `export const getRunner = (id) => SCENARIOS[id] ?? generic`.
- [ ] Commit: `feat(game): escenarios github, robo pc y genéricos`

### Task 8: Audio + mute + pulido (hora 14-15)

**Files:** `src/ui/MuteButton.tsx`, `OfficeScene.ts`

- [ ] Música chiptune loop volumen 0.2, iniciada en el primer click (autoplay policy). `MuteButton` → `game.sound.mute = !mute`, persistir en `localStorage`.
- [ ] Probar a 1920×1080 y 1366×768 (proyector).
- [ ] Commit: `feat(game): audio y mute`

### Task 9: Cita H4 — API real (hora 14-16)

- [ ] `.env` → `VITE_API_URL=https://<api-p3>`; correr checklist completo. CORS lo configura P3 (origen del Vercel + localhost:5173).
- [ ] Diferencias de contrato se reportan a P3 (él cede).
- [ ] Commit: `chore: apuntar a API real`

---

## Prácticas de equipo (todo el monorepo)

- Ramas `pN/<tema>`, PRs pequeños, 1 revisor; `main` siempre demoable.
- Contrato en README raíz con versión (`v1`); cambiarlo = avisar en el canal + bump.
- `.env` nunca se commitea; `.env.example` siempre actualizado.
- Datos de demo en JSON versionados (`src/mocks/`) = plan B si cae WiFi.
- Hora 20: freeze; solo bugs del flujo del demo.
