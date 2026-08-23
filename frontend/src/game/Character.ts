import Phaser from 'phaser';
import type { ItemCritico, Person } from '../types';
import type { OfficeScene } from './OfficeScene';
import type { Pathfinder } from './pathfinding';
import {
  PALETTE,
  HAIR_PALETTE,
  THEME,
  TILE,
  SPRITE_W,
  SPRITE_H,
  type PairKey,
} from './palette';
import { nextState, durationMs, pointFor, canMove } from './behavior';
import { resolveTargetTile } from './targets';
import { riskLevel, RISK_LEVEL_COLOR } from './risk';
import { DEMO_USER_ID } from '../api';
import { bus } from '../bus';

const SPEED = 64; // px/s, constante (guía: "caminar 64 px/s lineal")
const CELL_DURATION_MS = (TILE / SPEED) * 1000; // 500 ms por celda de 32 px
// Sentado: el personaje se planta en la silla, que está en el tile de ARRIBA
// del escritorio, y se baja 14 px para meterse detrás del tablero. El sprite
// del escritorio (profundidad por Y, ver OfficeScene) tapa las piernas, así
// que no hace falta recortarlas: el resultado es la pose "sentado de frente"
// del mockup, torso por encima de la mesa y piernas ocultas.
const SEAT_OFFSET_Y = 14;
const TYPE_INTERVAL_MS = 250; // 4 fps: el cuerpo late 1 px (manos tecleando)
// "La sala respira" (guía, sección 05): desfase inicial y espera de
// reintento, ambos 2-4s. Mismo rango para las dos cosas -> una sola pareja
// de constantes.
const AMBIENT_DELAY_MIN_MS = 2000;
const AMBIENT_DELAY_MAX_MS = 4000;
const ambientDelay = (): number =>
  AMBIENT_DELAY_MIN_MS +
  Math.random() * (AMBIENT_DELAY_MAX_MS - AMBIENT_DELAY_MIN_MS);

// Aura de riesgo: óvalo aplastado a los pies (la guía la dibuja así, no como
// un círculo alrededor). Se pinta con la textura `glow` (halo blanco de caída
// radial, ver gen-assets.mjs) en modo ADD y tintada: una elipse plana sumada
// sobre el ciruela del piso da un oliva sucio (lima .45 sobre #2A1747 sale
// 124,138,98 -- medido), mientras que un núcleo radial de alfa alta llega a
// 188,227,119 y sí se lee verde, como los glows del mockup.
const AURA_KEY = 'glow';
const AURA_Y = 26; // = SPRITE_H / 2: el borde inferior del sprite
// El mockup dibuja el óvalo de 84x22 px CSS sobre una celda de 64 px, o sea
// ~42x11 a escala de juego: más ancho que el propio sprite.
const AURA_W = 44;
const AURA_H = 15;
const AURA_HIGH_W = 58; // riesgo alto: aura más ancha, además del pulso
const AURA_HIGH_H = 20;
// Sentado, el tablero del escritorio tapa los pies y con ellos el aura. En vez
// de subirla a la altura del torso (donde el propio cuerpo la parte en dos y
// asoma como un par de alas), baja al suelo POR DELANTE de la mesa: se lee
// como luz derramándose bajo el escritorio y el nivel de riesgo sigue visible
// en el puesto, que es lo que pide la guía ("sentado conserva su aura").
const AURA_SEAT_Y = 54;
const AURA_SEAT_SCALE = 1.2;
const LABEL_Y = -34; // etiqueta flotante 8 px por encima de la cabeza

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

// Filas del spritesheet (32x52 por frame, 3 columnas x 4 filas):
// 0 frente, 1 izquierda, 2 derecha, 3 espalda.
const ROWS: Record<Direction, number> = { down: 0, left: 1, right: 2, up: 3 };
const COLS = 3;

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
        start: row * COLS,
        end: row * COLS + COLS - 1,
      }),
      // 8 fps = un cambio de cuadro cada 8 px a 64 px/s.
      frameRate: 8,
      repeat: -1,
    });
  }

  // Reposo frontal (columna 1 de la fila "frente"). `sit` y `type` reusan
  // este mismo cuadro recortado, ver `Character.play()`.
  for (const key of [idleKey, `${textureKey}_stand`]) {
    scene.anims.create({
      key,
      frames: scene.anims.generateFrameNumbers(textureKey, {
        start: 1,
        end: 1,
      }),
      frameRate: 1,
      repeat: -1,
    });
  }
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

function isBlocked(
  map: Phaser.Tilemaps.Tilemap,
  x: number,
  y: number,
): boolean {
  const tile = map.getTileAt(x, y, false, 'collision');
  return !!tile && tile.index > 0;
}

/** Personaje ambiental: contenedor con aura + 3 sprites apilados (cuerpo,
 * ropa, pelo) que camina por el mapa vía pathfinding y sigue un loop de
 * comportamiento ambiental (trabajar / café / reunión / caminar). */
export class Character extends Phaser.GameObjects.Container {
  readonly person: Person;
  readonly aura: Phaser.GameObjects.Image;
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
  private label?: Phaser.GameObjects.Text;
  private labelBorder?: Phaser.GameObjects.Rectangle;
  private labelTween?: Phaser.Tweens.Tween;
  private typeTimer?: Phaser.Time.TimerEvent;
  /** Desplazamiento vertical actual de las capas (0 de pie, ~14 sentado). */
  private seatDy = 0;
  private auraLevel: ReturnType<typeof riskLevel> = 'bajo';

  constructor(
    scene: OfficeScene,
    person: Person,
    pathfinder: Pathfinder,
    pair: [PairKey, PairKey],
  ) {
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

    this.aura = scene.add
      .image(0, AURA_Y, AURA_KEY)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.7);
    this.bodySprite = new Phaser.GameObjects.Sprite(scene, 0, 0, bodyKey, 1);
    this.clothes = new Phaser.GameObjects.Sprite(scene, 0, 0, clothesKey, 1);
    this.hair = new Phaser.GameObjects.Sprite(scene, 0, 0, hairKey, 1);

    // Pelo único + ropa única por personaje (guía, sección 04 · SPRITE
    // SHEET). El par llega ya resuelto desde `OfficeScene` (ver
    // `assignPairs` en palette.ts), que es quien ve la oficina entera y
    // puede garantizar que no se repita ninguno.
    this.hair.setTint(HAIR_PALETTE[pair[0]]);
    // El editor de avatar (usuario demo) manda sobre el par para la ropa:
    // `avatar_config.paleta` es sólo 6 colores (sin naranja), así que sigue
    // siendo `PALETTE`. Para el resto, `pair[1]` puede ser 'orange' (slot 6
    // de la guía, "ropa naranja"), que `PALETTE` no tiene -- se usa
    // `HAIR_PALETTE` (superset con los mismos valores para las 6 claves
    // compartidas) en vez de `PALETTE` para no perder ese slot.
    this.clothes.setTint(
      person.id === DEMO_USER_ID
        ? PALETTE[person.avatar_config.paleta]
        : HAIR_PALETTE[pair[1]],
    );

    // Origen centrado: los pies quedan en +26 (= AURA_Y) y la coronilla en
    // -26, que es de donde cuelgan el aura y la etiqueta flotante.
    for (const sprite of [this.bodySprite, this.clothes, this.hair]) {
      sprite.setOrigin(0.5, 0.5);
    }

    this.add([this.aura, this.bodySprite, this.clothes, this.hair]);
    this.play('type');

    this.setSize(SPRITE_W, SPRITE_H);
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

  /** Actualiza el color/animación del aura según el nivel de riesgo (guía,
   * sección 04 · AURAS DE RIESGO) y guarda los items críticos para el
   * tooltip (`bus.emit('person:click', ...)`). Siempre reemplaza (nunca
   * duplica) el tween del aura y la etiqueta flotante de riesgo alto:
   * cualquier llamada anterior se limpia primero. */
  setRisk(score: number, items: ItemCritico[]): void {
    this.riskScore = score;
    this.riskItems = items;

    this.pulseTween?.stop();
    this.pulseTween = undefined;
    this.labelTween?.stop();
    this.labelTween = undefined;
    this.label?.destroy();
    this.label = undefined;
    this.labelBorder?.destroy();
    this.labelBorder = undefined;

    const level = riskLevel(score);
    this.auraLevel = level;
    this.aura.setTint(RISK_LEVEL_COLOR[level]);
    this.applyAuraGeometry();

    switch (level) {
      case 'bajo':
        this.aura.setAlpha(0.7);
        break;

      case 'medio':
        this.pulseTween = this.scene.tweens.add({
          targets: this.aura,
          alpha: { from: 0.5, to: 0.9 },
          duration: 3000,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        break;

      case 'alto': {
        this.pulseTween = this.scene.tweens.add({
          targets: this.aura,
          alpha: { from: 0.55, to: 1 },
          duration: 700,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });

        // El mockup pinta la etiqueta como un CHIP: fondo BASE, borde ROJO y
        // texto VT323 ROJO (no texto suelto con contorno). `Phaser.Text` sabe
        // hacer el fondo pero no el borde, así que el borde va en un
        // rectángulo detrás; los dos se mueven juntos con el mismo tween.
        const label = this.scene.add
          .text(
            0,
            LABEL_Y + this.seatDy,
            `${this.person.nombre.toUpperCase()} ${score}`,
            {
              fontFamily: 'VT323, monospace',
              fontSize: '17px',
              color: THEME.rojo,
              backgroundColor: THEME.base,
              padding: { x: 4, y: 1 },
            },
          )
          .setOrigin(0.5);
        label.setResolution(2);
        const border = this.scene.add
          .rectangle(
            0,
            LABEL_Y + this.seatDy,
            label.width + 2,
            label.height + 2,
          )
          .setOrigin(0.5)
          .setStrokeStyle(1, RISK_LEVEL_COLOR.alto);
        this.add([label, border]);
        this.label = label;
        this.labelBorder = border;
        this.labelTween = this.scene.tweens.add({
          targets: [label, border],
          y: '-=3',
          duration: 1400,
          yoyo: true,
          repeat: -1,
        });
        break;
      }
    }
  }

  preUpdate(_time: number, _delta: number): void {
    this.depth = this.y;
  }

  /** Coloca y dimensiona el aura según el nivel de riesgo y si el personaje
   * está sentado (detrás del tablero) o de pie. */
  private applyAuraGeometry(): void {
    const high = this.auraLevel === 'alto';
    const w = high ? AURA_HIGH_W : AURA_W;
    const h = high ? AURA_HIGH_H : AURA_H;
    if (this.seatDy > 0) {
      this.aura
        .setPosition(0, AURA_SEAT_Y)
        .setDisplaySize(w * AURA_SEAT_SCALE, h);
    } else {
      this.aura.setPosition(0, AURA_Y).setDisplaySize(w, h);
    }
  }

  /** Reproduce la misma animación (por sufijo) en las tres capas.
   *
   * `sit` y `type` no tienen cuadro propio en la hoja (son 3 columnas fijas):
   * son el cuadro frontal de reposo bajado `SEAT_OFFSET_Y`, de modo que las
   * piernas quedan detrás del tablero del escritorio (que se dibuja encima
   * por profundidad) y el torso asoma por arriba, de cara al espectador.
   * `type` además hace latir el cuerpo 1 px a 4 fps (las manos moviéndose que
   * pide la guía en POSES MÍNIMAS). */
  play(anim: AnimName): void {
    const seated = anim === 'sit' || anim === 'type';
    const key = seated ? 'stand' : anim;
    const layers = [this.bodySprite, this.clothes, this.hair];
    for (const sprite of layers) {
      sprite.play(`${sprite.texture.key}_${key}`, true);
    }

    this.typeTimer?.remove();
    this.typeTimer = undefined;

    const seat = (dy: number) => {
      this.seatDy = dy;
      for (const sprite of layers) sprite.setY(dy);
      this.label?.setY(LABEL_Y + dy);
      this.labelBorder?.setY(LABEL_Y + dy);
      this.applyAuraGeometry();
    };

    if (!seated) {
      seat(0);
      return;
    }
    seat(SEAT_OFFSET_Y);
    if (anim !== 'type') return;

    let down = false;
    this.typeTimer = this.scene.time.addEvent({
      delay: TYPE_INTERVAL_MS,
      loop: true,
      callback: () => {
        down = !down;
        seat(SEAT_OFFSET_Y + (down ? 1 : 0));
      },
    });
  }

  /** Resuelve el tile destino para un nombre de punto (`scene.points`). La
   * regla vive en `targets.ts` (pura) para que `map.test.ts` pueda verificar
   * la alcanzabilidad del mapa real con exactamente esta misma lógica. */
  private resolveTargetTile(
    point: string,
    scene: OfficeScene,
  ): { x: number; y: number } {
    return resolveTargetTile(point, scene.points[point], (x, y) =>
      isBlocked(scene.map, x, y),
    );
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
    const isStale = () =>
      myGen !== this.walkGeneration || !this.scene?.sys?.isActive();

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

    const steps =
      path[0].x === from.x && path[0].y === from.y ? path.slice(1) : path;
    // ponytail: sin evitación dinámica de colisiones entre personajes; si dos
    // apuntan a la misma celda se separan con un offset fijo (ver abajo).
    const offsetX = (this.person.desk % 3) * 3;

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
   * aleatorio (2-4s, guía sección 05 "la sala respira") para que los
   * personajes no se muevan en bloque. */
  startBehavior(): void {
    if (this.running) return;
    this.running = true;
    this.scheduleNext(ambientDelay());
  }

  /** Detiene el loop ambiental, cancela cualquier timer pendiente Y cualquier
   * walkTo en curso (para que p.ej. `stopBehavior(); await walkTo('door')`
   * no compita con un tween-chain anterior todavía vivo). También detiene el
   * tween del aura y de la etiqueta flotante de riesgo alto (la etiqueta en
   * sí se destruye con el container, ver `destroy()`/`Container.preDestroy`). */
  stopBehavior(): void {
    this.running = false;
    if (this.timer) {
      this.timer.remove();
      this.timer = undefined;
    }
    this.cancelWalk();
    this.pulseTween?.stop();
    this.pulseTween = undefined;
    this.labelTween?.stop();
    this.labelTween = undefined;
    this.typeTimer?.remove();
    this.typeTimer = undefined;
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

  /** Un tick del loop ambiental: si la sala ya tiene 3 personajes caminando
   * (`OfficeScene.moving`), no arranca un `walkTo` nuevo -- espera 2-4s y
   * reintenta ("la sala respira", guía sección 05). Los `walkTo` de los
   * runners de escenario NO pasan por aquí (lo llaman directo), así que
   * nunca se ven afectados por este límite. */
  private async tick(): Promise<void> {
    if (!this.running || !this.scene) return;
    const scene = this.scene as OfficeScene;

    if (!canMove(scene.moving)) {
      this.scheduleNext(ambientDelay());
      return;
    }

    const state = nextState();
    scene.moving++;
    try {
      await this.walkTo(pointFor(state, this.person.desk));
    } finally {
      scene.moving--;
    }
    if (!this.running || !this.scene) return;
    this.play(state === 'trabajando' ? 'type' : 'idle');
    this.scheduleNext(durationMs(state));
  }
}

function chairPixelFor(
  scene: OfficeScene,
  deskIndex: number,
): { x: number; y: number } {
  const desk = scene.points[`desk_${deskIndex}`];
  const tx = desk.x / TILE + 1; // silla = tile arriba-derecha del escritorio
  const ty = desk.y / TILE - 1;
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}
