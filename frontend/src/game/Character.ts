import Phaser from 'phaser';
import type { ItemCritico, Person } from '../types';
import type { OfficeScene } from './OfficeScene';
import type { Pathfinder } from './pathfinding';
import { PALETTE } from './palette';
import { nextState, durationMs, pointFor } from './behavior';
import { scoreToColor, isCritical } from './risk';
import { bus } from '../bus';

const TILE = 16;
const SPEED = 64; // px/s, constante
const CELL_DURATION_MS = (TILE / SPEED) * 1000;
const SPAWN_DELAY_MAX_MS = 3000;

type Direction = 'up' | 'down' | 'left' | 'right';
export type AnimName =
  | 'sit'
  | 'type'
  | 'idle'
  | 'stand'
  | 'walk_up'
  | 'walk_down'
  | 'walk_left'
  | 'walk_right';

// Filas del spritesheet (16x24 por frame, 3 columnas x 4 filas).
const ROWS: Record<Direction, number> = { down: 0, left: 1, right: 2, up: 3 };

/** Crea las animaciones para una textura de personaje (una vez por textura,
 * compartida entre todas las instancias que la usan). */
function ensureAnims(scene: Phaser.Scene, textureKey: string): void {
  const idleKey = `${textureKey}_idle`;
  if (scene.anims.exists(idleKey)) return;

  for (const dir of Object.keys(ROWS) as Direction[]) {
    const row = ROWS[dir];
    scene.anims.create({
      key: `${textureKey}_walk_${dir}`,
      frames: scene.anims.generateFrameNumbers(textureKey, {
        start: row * 3,
        end: row * 3 + 2,
      }),
      frameRate: 8,
      repeat: -1,
    });
  }

  scene.anims.create({
    key: idleKey,
    frames: scene.anims.generateFrameNumbers(textureKey, { start: 1, end: 1 }),
    frameRate: 1,
    repeat: -1,
  });
  scene.anims.create({
    key: `${textureKey}_stand`,
    frames: scene.anims.generateFrameNumbers(textureKey, { start: 1, end: 1 }),
    frameRate: 1,
    repeat: -1,
  });
  scene.anims.create({
    key: `${textureKey}_sit`,
    frames: scene.anims.generateFrameNumbers(textureKey, { start: 10, end: 10 }),
    frameRate: 1,
    repeat: -1,
  });
  scene.anims.create({
    key: `${textureKey}_type`,
    frames: scene.anims.generateFrameNumbers(textureKey, { start: 10, end: 11 }),
    frameRate: 4,
    repeat: -1,
  });
}

function directionBetween(
  a: { x: number; y: number },
  b: { x: number; y: number },
): Direction | null {
  if (b.x > a.x) return 'right';
  if (b.x < a.x) return 'left';
  if (b.y > a.y) return 'down';
  if (b.y < a.y) return 'up';
  return null;
}

function isBlocked(map: Phaser.Tilemaps.Tilemap, x: number, y: number): boolean {
  const tile = map.getTileAt(x, y, false, 'collision');
  return !!tile && tile.index > 0;
}

/** Personaje ambiental: contenedor con aura + 3 sprites apilados (cuerpo,
 * ropa, pelo) que camina por el mapa vía pathfinding y sigue un loop de
 * comportamiento ambiental (trabajar / café / reunión / caminar). */
export class Character extends Phaser.GameObjects.Container {
  readonly person: Person;
  readonly aura: Phaser.GameObjects.Arc;
  /** Público en lectura; sólo `setRisk()` debería escribirlo. */
  riskScore = 0;
  riskItems: ItemCritico[] = [];

  private readonly bodySprite: Phaser.GameObjects.Sprite;
  private readonly clothes: Phaser.GameObjects.Sprite;
  private readonly hair: Phaser.GameObjects.Sprite;
  private readonly pathfinder: Pathfinder;

  private running = false;
  private timer?: Phaser.Time.TimerEvent;
  private walkTween?: Phaser.Tweens.Tween;
  private cancelCurrentTween?: () => void;
  private walkGeneration = 0;
  private pulseTween?: Phaser.Tweens.Tween;

  constructor(scene: OfficeScene, person: Person, pathfinder: Pathfinder) {
    const spawn = chairPixelFor(scene, person.desk);
    super(scene, spawn.x, spawn.y);

    this.person = person;
    this.pathfinder = pathfinder;

    const bodyKey = `char_body_${person.avatar_config.cuerpo}`;
    const hairKey = `char_hair_${person.avatar_config.peinado}`;
    const clothesKey = `char_clothes_${person.avatar_config.ropa}`;
    ensureAnims(scene, bodyKey);
    ensureAnims(scene, hairKey);
    ensureAnims(scene, clothesKey);

    this.aura = scene.add.circle(0, 8, 7, 0xffffff, 0.25);
    this.bodySprite = new Phaser.GameObjects.Sprite(scene, 0, 0, bodyKey, 1);
    this.clothes = new Phaser.GameObjects.Sprite(scene, 0, 0, clothesKey, 1);
    this.hair = new Phaser.GameObjects.Sprite(scene, 0, 0, hairKey, 1);
    this.clothes.setTint(PALETTE[person.avatar_config.paleta]);

    for (const sprite of [this.bodySprite, this.clothes, this.hair]) {
      sprite.setOrigin(0.5, 0.75);
    }

    this.add([this.aura, this.bodySprite, this.clothes, this.hair]);
    this.play('type');

    this.setSize(16, 24);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => {
      bus.emit('person:click', {
        id: this.person.id,
        nombre: this.person.nombre,
        rol: this.person.rol,
        score: this.riskScore,
        items: this.riskItems,
      });
    });

    scene.sys.updateList.add(this);
    scene.events.once('shutdown', () => this.stopBehavior());
  }

  /** Actualiza el color/pulso del aura según el score de riesgo y guarda los
   * items críticos para el tooltip (`bus.emit('person:click', ...)`). */
  setRisk(score: number, items: ItemCritico[]): void {
    this.riskScore = score;
    this.riskItems = items;

    this.aura.setFillStyle(scoreToColor(score), 0.55);

    if (isCritical(score)) {
      this.aura.setRadius(9);
      if (!this.pulseTween) {
        this.pulseTween = this.scene.tweens.add({
          targets: this.aura,
          alpha: { from: 0.3, to: 0.9 },
          duration: 600,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    } else {
      this.pulseTween?.stop();
      this.pulseTween = undefined;
      this.aura.setAlpha(0.55);
    }
  }

  preUpdate(_time: number, _delta: number): void {
    this.depth = this.y;
  }

  /** Reproduce la misma animación (por sufijo) en las tres capas. */
  play(anim: AnimName): void {
    for (const sprite of [this.bodySprite, this.clothes, this.hair]) {
      sprite.play(`${sprite.texture.key}_${anim}`, true);
    }
  }

  /** Resuelve el tile destino para un nombre de punto (`scene.points`). */
  private resolveTargetTile(point: string, scene: OfficeScene): { x: number; y: number } {
    if (point.startsWith('desk_')) {
      const desk = scene.points[point];
      return { x: desk.x / TILE, y: desk.y / TILE + 1 };
    }
    const p = scene.points[point];
    const tile = { x: p.x / TILE, y: p.y / TILE };
    return isBlocked(scene.map, tile.x, tile.y) ? { x: tile.x, y: tile.y + 1 } : tile;
  }

  private tweenTo(x: number, y: number): Promise<'done' | 'cancelled'> {
    return new Promise((resolve) => {
      const finish = (result: 'done' | 'cancelled') => {
        this.walkTween = undefined;
        this.cancelCurrentTween = undefined;
        resolve(result);
      };
      this.cancelCurrentTween = () => {
        this.walkTween?.stop(); // Tween#stop() does NOT fire onComplete, so
        finish('cancelled'); // we resolve by hand or the walk hangs forever.
      };
      this.walkTween = this.scene.tweens.add({
        targets: this,
        x,
        y,
        duration: CELL_DURATION_MS,
        ease: 'Linear',
        onComplete: () => finish('done'),
      });
    });
  }

  /** Cancela cualquier `walkTo` en curso: detiene el tween activo (si hay) y
   * resuelve su promesa pendiente, e invalida cualquier llamada a `walkTo`
   * que siga esperando un `findPath` (vía `walkGeneration`). Se usa al
   * arrancar un `walkTo` nuevo, en `stopBehavior()` y en el shutdown de la
   * escena (a través de `stopBehavior()`). */
  private cancelWalk(): void {
    this.walkGeneration++;
    this.cancelCurrentTween?.();
  }

  /** Camina hasta `point` (nombre en `scene.points`) siguiendo el path del
   * pathfinder, un tween por celda, sin teletransportes.
   * Nota: se llama `walkTo` (no `moveTo`) para no sombrear
   * `Container.moveTo(child, index)` (reordenar hijos) con una firma
   * incompatible. */
  async walkTo(point: string): Promise<void> {
    this.cancelWalk(); // un walkTo nuevo siempre reemplaza uno en curso
    const myGen = this.walkGeneration;
    const isStale = () => myGen !== this.walkGeneration || !this.scene?.sys?.isActive();

    const scene = this.scene as OfficeScene;
    const target = this.resolveTargetTile(point, scene);
    const from = { x: Math.floor(this.x / TILE), y: Math.floor(this.y / TILE) };

    if (from.x === target.x && from.y === target.y) {
      this.play('idle');
      return;
    }

    const path = await this.pathfinder.findPath(from, target);
    if (isStale()) return;
    if (path.length === 0) {
      this.play('idle');
      return;
    }

    const steps = path[0].x === from.x && path[0].y === from.y ? path.slice(1) : path;
    // ponytail: sin evitación dinámica de colisiones entre personajes; si dos
    // apuntan a la misma celda se separan con un offset fijo (ver abajo).
    const offsetX = (this.person.desk % 3) * 2;

    let prev = from;
    let lastDir: Direction | null = null;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const dir = directionBetween(prev, step);
      if (dir && dir !== lastDir) {
        this.play(`walk_${dir}`);
        lastDir = dir;
      }
      const isLast = i === steps.length - 1;
      const targetX = step.x * TILE + TILE / 2 + (isLast ? offsetX : 0);
      const targetY = step.y * TILE + TILE / 2;
      const result = await this.tweenTo(targetX, targetY);
      if (result === 'cancelled' || isStale()) return;
      prev = step;
    }

    this.play('idle');
  }

  /** Arranca el loop de comportamiento ambiental con un delay inicial
   * aleatorio (0-3s) para que los personajes no se muevan en bloque. */
  startBehavior(): void {
    if (this.running) return;
    this.running = true;
    this.scheduleNext(Math.random() * SPAWN_DELAY_MAX_MS);
  }

  /** Detiene el loop ambiental, cancela cualquier timer pendiente Y cualquier
   * walkTo en curso (para que p.ej. `stopBehavior(); await walkTo('door')`
   * no compita con un tween-chain anterior todavía vivo). */
  stopBehavior(): void {
    this.running = false;
    if (this.timer) {
      this.timer.remove();
      this.timer = undefined;
    }
    this.cancelWalk();
    this.pulseTween?.stop();
    this.pulseTween = undefined;
  }

  /** Cualquier ruta de destrucción (no sólo el shutdown de la escena) debe
   * detener el loop ambiental y el tween de pulso del aura, para no dejar
   * un tween corriendo sobre un GameObject ya destruido. */
  destroy(fromScene?: boolean): void {
    this.stopBehavior();
    super.destroy(fromScene);
  }

  private scheduleNext(delayMs: number): void {
    this.timer = this.scene.time.delayedCall(delayMs, () => {
      void this.tick();
    });
  }

  private async tick(): Promise<void> {
    if (!this.running || !this.scene) return;
    const state = nextState();
    await this.walkTo(pointFor(state, this.person.desk));
    if (!this.running || !this.scene) return;
    this.play(state === 'trabajando' ? 'type' : 'idle');
    this.scheduleNext(durationMs(state));
  }
}

function chairPixelFor(scene: OfficeScene, deskIndex: number): { x: number; y: number } {
  const desk = scene.points[`desk_${deskIndex}`];
  const tx = desk.x / TILE;
  const ty = desk.y / TILE + 1;
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}
