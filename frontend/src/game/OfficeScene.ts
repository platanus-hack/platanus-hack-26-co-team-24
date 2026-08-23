import Phaser from 'phaser';
import { getOficina, getRiesgo, simular, DEMO_USER_ID } from '../api';
import type { Riesgo } from '../types';
import { Character } from './Character';
import { createPathfinder, type Pathfinder } from './pathfinding';
import { loadAvatar } from '../avatarStorage';
import { bus } from '../bus';
import { getRunner } from './scenarios';
import { assignPairs, THEME, TILE, SPRITE_W, SPRITE_H } from './palette';

const OBJECTS_KEY = 'objects';

// Cada char_*.png es un spritesheet de 96x208: 3 columnas x 4 filas de
// frames de 32x52 (filas: frente, izquierda, derecha, espalda; columnas:
// 3 poses de caminata, la columna 1 es la pose de reposo).
const CHARACTER_SHEETS = [
  'char_body_light',
  'char_body_dark',
  'char_hair_short',
  'char_hair_long',
  'char_clothes_shirt',
  'char_clothes_suit',
];

// Frame indices in sprites/objects.png (see gen-assets.mjs / ATTRIBUTION.md):
// 0 server_on, 1 server_off, 2 pc_on, 3 pc_off, 4 coffee_a, 5 coffee_b,
// 6 lamp_a, 7 lamp_b, 8 meet_on, 9 meet_off, 10 console, 11 question.
// Titileo `steps(2)` de la guía: las pantallas están encendidas casi todo el
// rato y dan un pestañeo corto, no un 50/50 encendido/apagado (que se leería
// como "media oficina rota"). Los frames `_off` son el estado caído que usan
// los escenarios, así que sólo aparecen 1 de cada 6 cuadros -- o ninguno, en
// el caso del rack, que en el mockup nunca se pone rojo por su cuenta.
const ANIMS: Array<{
  key: string;
  frames: number[];
  frameRate: number;
}> = [
  { key: 'pc', frames: [2, 2, 2, 2, 2, 3], frameRate: 4 },
  { key: 'coffee', frames: [4, 4, 4, 5], frameRate: 2 },
  { key: 'lamp', frames: [6, 6, 6, 7], frameRate: 1 },
  { key: 'meet', frames: [8, 8, 8, 8, 8, 9], frameRate: 4 },
];

const DESK_COUNT = 9;
// Lámparas del techo: columnas de tiles sobre la franja de muro superior
// (ver scripts/gen-map.mjs, LAMPS).
const LAMP_COLUMNS = [4, 10, 16];
const LAMP_ROW = 0;
const LAMP_OFFSET_Y = 8; // el círculo cuelga un poco por debajo del borde

// Glows del mockup (`box-shadow` en la guía): NO están horneados en los PNG.
// Se pintan aquí, en modo aditivo, detrás de los objetos que emiten luz, con
// la textura `glow` (halo blanco con caída radial, ver gen-assets.mjs) para
// que tengan la misma caída suave que el `box-shadow` del mockup. Son 14 en
// total: 9 monitores + rack + pantalla Meet + 3 lámparas.
const GLOW_KEY = 'glow';
// Frames extra de objects.png (ver gen-assets.mjs); los 12 primeros índices
// siguen siendo los históricos.
const FRAME = { desk: 12, monitorFrame: 13, rackCapOn: 14, rackCapOff: 15 };
// Color del bisel de cada monitor: el mockup lo varía de puesto a puesto. El
// interior de la pantalla se queda en `#3A1959` porque el marco es un sprite
// aparte (`monitor_frame`) y sólo se tinta él -- tintar el sprite entero
// dejaría el interior casi negro (el tinte de Phaser multiplica).
const MONITOR_TINT = [
  THEME.turquesa,
  THEME.oro,
  THEME.turquesa,
  THEME.rosa,
  THEME.turquesa,
  THEME.oro,
  THEME.turquesa,
  THEME.lima,
  THEME.turquesa,
];
// La torre del rack GitHub son 3 segmentos apilados hacia arriba desde el
// punto `server` (el de abajo, una tapa volteada). Los nombres de `objects`
// son los que consumen los runners de escenario (ver scenarios/github.ts), y
// cada sprite lleva su frame "caído" en el data `offFrame`.
const RACK_SEGMENTS = [
  { key: 'server', dy: 0, frame: 14, off: 15, flip: true },
  { key: 'server_mid', dy: -1, frame: 0, off: 1, flip: false },
  { key: 'server_top', dy: -2, frame: 14, off: 15, flip: false },
];
// Recuadro de la sala Meet en tiles. Cubre el interior (x 15..18, y 2..4, ver
// MEET en scripts/gen-map.mjs) y sube una fila para englobar la pantalla que
// cuelga del muro, igual que el mockup dibuja su marco sobre la franja alta.
const MEET_ROOM = { x: 15, y: 1, w: 4, h: 4 };
// El monitor asoma 12 px por encima del canto de la mesa, apoyado en ella
// (el mockup lo dibuja montado sobre el tablero).
const PC_OFFSET_Y = -12;

// Color hex (`#RRGGBB`) -> entero para las APIs de Phaser.
const hex = (s: string): number => parseInt(s.slice(1), 16);

export class OfficeScene extends Phaser.Scene {
  map!: Phaser.Tilemaps.Tilemap;
  points: Record<string, { x: number; y: number }> = {};
  objects: Record<string, Phaser.GameObjects.Sprite> = {};
  pathfinder!: Pathfinder;
  characters: Record<string, Character> = {};
  /** Objetos creados por el runner de escenario (iconos "?", overlays...).
   * `restore()` reinicia la escena, así que sólo se usan para poder
   * inspeccionarlos/limpiarlos sin reinicio completo. */
  scenarioFx: Phaser.GameObjects.GameObject[] = [];
  scenarioRunning = false;
  /** "La sala respira" (guía, sección 05): cuántos personajes están
   * caminando ambientalmente ahora mismo. `Character.tick()` lo incrementa
   * antes de un `walkTo` ambiental y lo decrementa al terminar/cancelar;
   * nunca sube de `MAX_MOVING` (ver `behavior.ts`). Los `walkTo` que llaman
   * los runners de escenario no pasan por este contador. */
  moving = 0;

  constructor() {
    super('office');
  }

  preload(): void {
    this.load.tilemapTiledJSON('office', '/assets/maps/office.json');
    this.load.image('office-tiles', '/assets/tiles/office.png');
    this.load.image(GLOW_KEY, '/assets/sprites/glow.png');
    this.load.spritesheet(OBJECTS_KEY, '/assets/sprites/objects.png', {
      frameWidth: TILE,
      frameHeight: TILE,
    });
    for (const key of CHARACTER_SHEETS) {
      this.load.spritesheet(key, `/assets/sprites/${key}.png`, {
        frameWidth: SPRITE_W,
        frameHeight: SPRITE_H,
      });
    }
  }

  create(): void {
    // `restart()` reutiliza la instancia de la escena: limpiamos los registros
    // para no quedarnos con referencias a objetos ya destruidos mientras
    // `spawnCharacters()` (async) repuebla `characters`.
    this.points = {};
    this.objects = {};
    this.characters = {};
    this.moving = 0;

    this.map = this.make.tilemap({ key: 'office' });
    const tileset = this.map.addTilesetImage('office', 'office-tiles');
    if (!tileset) throw new Error('office tileset failed to load');

    this.map.createLayer('floor', tileset, 0, 0);
    this.map.createLayer('walls', tileset, 0, 0);
    this.map.createLayer('furniture', tileset, 0, 0);
    // collision data is read by the pathfinder later; not rendered.
    this.map.createLayer('collision', tileset, 0, 0)?.setVisible(false);

    this.loadPoints();
    this.drawRoomTrim();
    this.createAnimations();
    this.placeGlows();
    this.placeObjects();
    this.setupCamera();

    this.pathfinder = createPathfinder(this.map);
    void this.spawnCharacters();

    this.scenarioFx = [];
    this.scenarioRunning = false;
    bus.on('scenario:start', this.onScenarioStart, this);
    bus.on('scenario:restore', this.restore, this);
    const unhook = () => {
      bus.off('scenario:start', this.onScenarioStart, this);
      bus.off('scenario:restore', this.restore, this);
    };
    // `restart()` emite 'shutdown'; `game.destroy()` emite 'destroy' (ver
    // Phaser Systems.destroy). Sin el segundo, al navegar /oficina -> /avatar
    // -> /oficina la escena muerta seguiría atendiendo el bus.
    this.events.once('shutdown', unhook);
    this.events.once('destroy', unhook);
  }

  /** Corre en paralelo la simulación (API) y su animación en la oficina, para
   * que el resultado nunca llegue antes de que termine el show. Si la API
   * falla, se restaura la oficina: en el demo nunca se queda a medias. */
  private async onScenarioStart({
    scenario_id,
    person_id,
  }: {
    scenario_id: string;
    person_id?: string;
  }): Promise<void> {
    if (this.scenarioRunning) return;
    this.scenarioRunning = true;
    const t0 = performance.now();
    try {
      // allSettled (y no all): si la API falla primero, el runner sigue
      // mutando la escena; restaurar antes de que termine haría que sus
      // continuaciones re-vandalizaran la escena nueva.
      const [sim, anim] = await Promise.allSettled([
        simular({ scenario_id, person_id }),
        getRunner(scenario_id)(this, person_id),
      ]);
      if (sim.status === 'fulfilled' && anim.status === 'fulfilled') {
        bus.emit('scenario:result', {
          result: sim.value,
          ms: performance.now() - t0,
        });
      } else {
        const err =
          sim.status === 'rejected'
            ? sim.reason
            : (anim as PromiseRejectedResult).reason;
        console.error('scenario:start', err);
        bus.emit('scenario:error', String(err));
        this.restore();
      }
    } finally {
      this.scenarioRunning = false;
    }
  }

  /** Deshace cualquier escenario simulado. ponytail: en vez de revertir cada
   * efecto a mano, reiniciamos la escena (re-spawnea personajes y recarga el
   * riesgo). Los handlers de `shutdown`/`destroy` desenganchan el bus para no
   * duplicar listeners al volver a `create()`. */
  restore(): void {
    this.scene.restart();
  }

  private async spawnCharacters(): Promise<void> {
    try {
      // Un `Phaser.GameObjects.Text` con una fuente web (VT323, la etiqueta
      // flotante de riesgo alto) se crea con la fuente que esté cargada en
      // ESE momento: si aún no cargó, el navegador la sustituye por el
      // fallback y el layout inicial se calcula mal (el texto no re-mide
      // solo cuando la fuente llega después). Esperamos su carga (en
      // paralelo con `getOficina`, no en serie) antes de crear personajes,
      // pero con un techo de 1 s: una carga de fuente colgada nunca debe
      // impedir que la oficina se pueble.
      const fontReady = (async () => {
        try {
          await Promise.race([
            document.fonts.load('17px VT323'),
            new Promise((r) => setTimeout(r, 1000)),
          ]);
        } catch {
          // best-effort: sin bloquear el spawn de personajes por esto.
        }
      })();
      const [oficina] = await Promise.all([getOficina(), fontReady]);
      // La escena pudo haberse cerrado mientras esperábamos la respuesta.
      if (!this.sys.isActive()) return;
      // El editor de avatar (/avatar) guarda la config del usuario demo en
      // localStorage; la reflejamos aquí para que "crear avatar -> recargar
      // -> el personaje lo luce" funcione. También en modo real: P3 aún no
      // persiste avatares (no hay PUT /avatar) y su `avatar_config` viene en
      // otro formato, así que localStorage es la única fuente del avatar
      // que el usuario acaba de crear.
      const localAvatar = loadAvatar();
      // Pelo+ropa únicos por persona: se reparte con la oficina entera a la
      // vista (guía, sección 04: "nunca dos personajes con el mismo par").
      const pairs = assignPairs(oficina.people);
      for (const person of oficina.people) {
        if (localAvatar && person.id === DEMO_USER_ID) {
          person.avatar_config = localAvatar;
        }
        const character = new Character(
          this,
          person,
          this.pathfinder,
          pairs[person.id],
        );
        this.add.existing(character);
        this.characters[person.id] = character;
        character.startBehavior();
      }
      this.loadRisk();
    } catch (err) {
      console.error('getOficina', err);
    }
  }

  private loadRisk(): void {
    getRiesgo()
      .then((r) => {
        if (!this.sys.isActive()) return;
        this.applyRisk(r);
      })
      .catch((err) => console.error('getRiesgo', err));
  }

  /** Aplica un `Riesgo` a los personajes ya spawneados (color/pulso del aura
   * + items críticos para el tooltip). Público para poder re-ejecutarse tras
   * restaurar un escenario simulado. */
  applyRisk(riesgo: Riesgo): void {
    riesgo.scores.forEach((s) => {
      this.characters[s.person_id]?.setRisk(s.score, s.items_criticos);
    });
  }

  private loadPoints(): void {
    const layer = this.map.getObjectLayer('points');
    for (const obj of layer?.objects ?? []) {
      if (obj.name && obj.x !== undefined && obj.y !== undefined) {
        this.points[obj.name] = { x: obj.x, y: obj.y };
      }
    }
  }

  /** Detalles de sala del mockup (sección 05) que no son tiles: la franja
   * ROSA al pie del muro superior (`top: 116px; height: 6px; #FF4D9D;
   * opacity:.45` = 3 px a escala 1x justo donde el muro toca el piso), el
   * recuadro MORADO de la sala Meet y las dos etiquetas VT323. */
  private drawRoomTrim(): void {
    this.add
      .rectangle(0, TILE * 2, this.map.widthInPixels, 3, hex(THEME.rosa), 0.45)
      .setOrigin(0, 1);

    // Recuadro de la sala Meet (x 15..18, y 2..4 en tiles, ver gen-map.mjs).
    this.add
      .rectangle(MEET_ROOM.x * TILE, MEET_ROOM.y * TILE, MEET_ROOM.w * TILE, MEET_ROOM.h * TILE)
      .setOrigin(0)
      .setFillStyle(hex(THEME.morado), 0.12)
      .setStrokeStyle(2, hex(THEME.morado), 0.9);

    // Dentro del marco y por debajo de la lámpara del techo, para no chocar.
    // Bajo el muro, dentro de la sala: arriba chocaría con la pantalla.
    this.roomLabel(MEET_ROOM.x * TILE + 4, (MEET_ROOM.y + 1) * TILE + 3, 'SALA MEET', THEME.lila);
    const server = this.points['server'];
    if (server) this.roomLabel(server.x - 36, server.y - TILE * 2 - 18, 'GITHUB', THEME.lima);
  }

  private roomLabel(x: number, y: number, text: string, color: string): void {
    this.add
      .text(x, y, text, {
        fontFamily: 'VT323, monospace',
        fontSize: '17px',
        color,
      })
      .setResolution(2);
  }

  private createAnimations(): void {
    for (const { key, frames, frameRate } of ANIMS) {
      if (this.anims.exists(key)) continue;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(OBJECTS_KEY, { frames }),
        frameRate,
        repeat: -1,
      });
    }
  }

  /** Places a 32x32 sprite so it's centered on the tile at `point`, with an optional vertical pixel offset. */
  private spriteAt(
    point: { x: number; y: number },
    offsetY = 0,
  ): Phaser.GameObjects.Sprite {
    return this.add.sprite(
      point.x + TILE / 2,
      point.y + TILE / 2 + offsetY,
      OBJECTS_KEY,
    );
  }

  /** Halo aditivo detrás de un objeto luminoso. Se crea antes que los
   * sprites de `placeObjects()` (misma profundidad 0, orden de creación) para
   * que quede debajo de ellos y encima de las capas del mapa. */
  private glow(
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    alpha: number,
  ): void {
    this.add
      .image(x, y, GLOW_KEY)
      .setDisplaySize(w, h)
      .setTint(hex(color))
      .setAlpha(alpha)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  private placeGlows(): void {
    for (let i = 0; i < DESK_COUNT; i++) {
      const desk = this.points[`desk_${i}`];
      if (!desk) continue;
      this.glow(
        desk.x + TILE / 2,
        desk.y + TILE / 2 + PC_OFFSET_Y,
        60,
        48,
        THEME.turquesa,
        0.45,
      );
    }
    const server = this.points['server'];
    if (server) {
      this.glow(
        server.x + TILE / 2,
        server.y + TILE / 2 - TILE,
        84,
        150,
        THEME.lima,
        0.45,
      );
    }
    const meet = this.points['meet_screen'];
    if (meet) {
      this.glow(
        meet.x + TILE,
        meet.y + TILE / 2,
        118,
        64,
        THEME.turquesa,
        0.5,
      );
    }
    for (const col of LAMP_COLUMNS) {
      this.glow(
        col * TILE + TILE / 2,
        LAMP_ROW * TILE + TILE / 2 + LAMP_OFFSET_Y,
        110,
        110,
        THEME.oro,
        0.5,
      );
    }
  }

  private placeObjects(): void {
    // Torre del rack: 3 segmentos apilados hacia arriba desde el punto
    // `server`. El de abajo es la tapa volteada, el del medio lleva 2 filas
    // de LEDs: 4 filas en total, como el mockup.
    for (const seg of RACK_SEGMENTS) {
      const sprite = this.spriteAt(this.points['server'], seg.dy * TILE);
      sprite.setFrame(seg.frame).setFlipY(seg.flip).setData('offFrame', seg.off);
      this.objects[seg.key] = sprite;
    }

    // Pantalla Meet de 2 tiles (el panel de 208 px del mockup): dos sprites
    // contiguos con el mismo frame, dibujado a todo el ancho, sin costura.
    const meet = this.points['meet_screen'];
    const meetScreen = this.spriteAt(meet);
    meetScreen.play('meet');
    this.objects['meet_screen'] = meetScreen;
    const meetScreenB = this.spriteAt({ x: meet.x + TILE, y: meet.y });
    meetScreenB.play('meet');
    this.objects['meet_screen_b'] = meetScreenB;

    for (let i = 0; i < DESK_COUNT; i++) {
      const desk = this.points[`desk_${i}`];
      if (!desk) continue;
      // Monitor: primero el interior de la pantalla (que titila) y encima el
      // bisel, tintado por puesto. Va apoyado en el canto de la mesa,
      // asomando hacia arriba, como en el mockup.
      const pc = this.spriteAt(desk, PC_OFFSET_Y);
      pc.play('pc');
      this.objects[`pc_${i}`] = pc;
      const bezel = this.spriteAt(desk, PC_OFFSET_Y);
      bezel.setFrame(FRAME.monitorFrame).setTint(hex(MONITOR_TINT[i]));
      this.objects[`pc_frame_${i}`] = bezel;
      // El tablero (2 tiles) es sprite y no tile: con profundidad = su Y tapa
      // las piernas de quien está sentado detrás (silla en la fila de arriba)
      // y queda por detrás de quien pasa por delante.
      [0, TILE].forEach((dx, n) => {
        const board = this.spriteAt({ x: desk.x + dx, y: desk.y });
        board.setFrame(FRAME.desk).setDepth(desk.y + TILE / 2);
        this.objects[`desk_${i}${n ? '_b' : ''}`] = board;
      });
    }

    const coffee = this.spriteAt(this.points['coffee']);
    coffee.play('coffee');
    this.objects['coffee'] = coffee;

    const console_ = this.spriteAt(this.points['console']);
    console_.setFrame(10); // console: static frame, no blink animation
    console_
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => bus.emit('console:open'));
    this.objects['console'] = console_;

    LAMP_COLUMNS.forEach((col, i) => {
      const lamp = this.spriteAt(
        { x: col * TILE, y: LAMP_ROW * TILE },
        LAMP_OFFSET_Y,
      );
      lamp.play('lamp');
      this.objects[`lamp_${i}`] = lamp;
    });
  }

  private setupCamera(): void {
    const cam = this.cameras.main;
    // No zoom/pan: the map is exactly the size of the game canvas (640x416),
    // so the whole office fits on screen at zoom 1. Config-level `zoom: 2`
    // (see game/config.ts) scales the canvas up for pixel-art crispness.
    cam.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
  }
}
