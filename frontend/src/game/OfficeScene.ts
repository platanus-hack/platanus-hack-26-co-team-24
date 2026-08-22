import Phaser from 'phaser';
import { getOficina, getRiesgo, simular } from '../api';
import type { Riesgo } from '../types';
import { Character } from './Character';
import { createPathfinder, type Pathfinder } from './pathfinding';
import { loadAvatar } from '../avatarStorage';
import { bus } from '../bus';
import { getRunner } from './scenarios';

const DEMO_USER_ID = 'p_ana';

const OBJECTS_KEY = 'objects';

// Cada char_*.png es un spritesheet de 48x96: 3 columnas x 4 filas de
// frames de 16x24 (filas: down, left, right, up; columnas: 3 poses de
// caminata, la columna 1 es la pose de pie).
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
const ANIMS: Array<{
  key: string;
  start: number;
  end: number;
  frameRate: number;
}> = [
  { key: 'server', start: 0, end: 1, frameRate: 2 },
  { key: 'pc', start: 2, end: 3, frameRate: 1 },
  { key: 'coffee', start: 4, end: 5, frameRate: 2 },
  { key: 'lamp', start: 6, end: 7, frameRate: 0.5 },
  { key: 'meet', start: 8, end: 9, frameRate: 1 },
];

const DESK_COUNT = 9;
const LAMP_COLUMNS = [6, 15, 24, 34]; // tile x positions along the ceiling row
const LAMP_ROW = 1; // tile y position (ceiling row)

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

  constructor() {
    super('office');
  }

  preload(): void {
    this.load.tilemapTiledJSON('office', '/assets/maps/office.json');
    this.load.image('office-tiles', '/assets/tiles/office.png');
    this.load.spritesheet(OBJECTS_KEY, '/assets/sprites/objects.png', {
      frameWidth: 16,
      frameHeight: 16,
    });
    for (const key of CHARACTER_SHEETS) {
      this.load.spritesheet(key, `/assets/sprites/${key}.png`, {
        frameWidth: 16,
        frameHeight: 24,
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

    this.map = this.make.tilemap({ key: 'office' });
    const tileset = this.map.addTilesetImage('office', 'office-tiles');
    if (!tileset) throw new Error('office tileset failed to load');

    this.map.createLayer('floor', tileset, 0, 0);
    this.map.createLayer('walls', tileset, 0, 0);
    this.map.createLayer('furniture', tileset, 0, 0);
    // collision data is read by the pathfinder later; not rendered.
    this.map.createLayer('collision', tileset, 0, 0)?.setVisible(false);

    this.loadPoints();
    this.createAnimations();
    this.placeObjects();
    this.setupCamera();

    this.pathfinder = createPathfinder(this.map);
    this.spawnCharacters();

    this.scenarioFx = [];
    this.scenarioRunning = false;
    bus.on('scenario:start', this.onScenarioStart, this);
    bus.on('scenario:restore', this.restore, this);
    this.events.once('shutdown', () => {
      bus.off('scenario:start', this.onScenarioStart, this);
      bus.off('scenario:restore', this.restore, this);
    });
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
    try {
      const [result] = await Promise.all([
        simular({ scenario_id, person_id }),
        getRunner(scenario_id)(this, person_id),
      ]);
      bus.emit('scenario:result', result);
    } catch (err) {
      console.error('scenario:start', err);
      bus.emit('scenario:error', String(err));
      this.restore();
    } finally {
      this.scenarioRunning = false;
    }
  }

  /** Deshace cualquier escenario simulado. ponytail: en vez de revertir cada
   * efecto a mano, reiniciamos la escena (re-spawnea personajes y recarga el
   * riesgo). El handler de `shutdown` desengancha el bus para no duplicar
   * listeners al volver a `create()`. */
  restore(): void {
    this.scene.restart();
  }

  private spawnCharacters(): void {
    getOficina()
      .then((oficina) => {
        // La escena pudo haberse cerrado mientras esperábamos la respuesta.
        if (!this.sys.isActive()) return;
        // Sin backend real, el editor de avatar (/avatar) guarda la config
        // del usuario demo en localStorage; la reflejamos aquí para que
        // "crear avatar -> recargar -> el personaje lo luce" funcione.
        const localAvatar = !import.meta.env.VITE_API_URL ? loadAvatar() : null;
        for (const person of oficina.people) {
          if (localAvatar && person.id === DEMO_USER_ID) {
            person.avatar_config = localAvatar;
          }
          const character = new Character(this, person, this.pathfinder);
          this.add.existing(character);
          this.characters[person.id] = character;
          character.startBehavior();
        }
        this.loadRisk();
      })
      .catch((err) => console.error('getOficina', err));
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

  private createAnimations(): void {
    for (const { key, start, end, frameRate } of ANIMS) {
      if (this.anims.exists(key)) continue;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(OBJECTS_KEY, { start, end }),
        frameRate,
        repeat: -1,
      });
    }
  }

  /** Places a 16x16 sprite so it's centered on the tile at `point`, with an optional vertical pixel offset. */
  private spriteAt(
    point: { x: number; y: number },
    offsetY = 0,
  ): Phaser.GameObjects.Sprite {
    return this.add.sprite(point.x + 8, point.y + 8 + offsetY, OBJECTS_KEY);
  }

  private placeObjects(): void {
    const server = this.spriteAt(this.points['server']);
    server.play('server');
    this.objects['server'] = server;

    const meetScreen = this.spriteAt(this.points['meet_screen']);
    meetScreen.play('meet');
    this.objects['meet_screen'] = meetScreen;

    for (let i = 0; i < DESK_COUNT; i++) {
      const desk = this.points[`desk_${i}`];
      if (!desk) continue;
      const pc = this.spriteAt(desk, -8);
      pc.play('pc');
      this.objects[`pc_${i}`] = pc;
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
      const lamp = this.spriteAt({ x: col * 16, y: LAMP_ROW * 16 });
      lamp.play('lamp');
      this.objects[`lamp_${i}`] = lamp;
    });
  }

  private setupCamera(): void {
    const cam = this.cameras.main;
    // No zoom/pan: the map is exactly the size of the game canvas (640x400),
    // so the whole office fits on screen at zoom 1. Config-level `zoom: 2`
    // (see game/config.ts) scales the canvas up for pixel-art crispness.
    cam.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
  }
}
