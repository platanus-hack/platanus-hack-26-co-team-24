import Phaser from 'phaser';
import type { OfficeScene } from '../OfficeScene';

const QUESTION_FRAME = 11; // sprites/objects.png -> icono "?"
const GLOW_KEY = 'glow'; // halo aditivo anónimo de OfficeScene.glow()

/** Espera `ms` respetando el reloj de la escena (para que `scene.time`
 * pausado/destruido no deje promesas colgadas). Compartido por todos los
 * runners de escenario. */
export const wait = (scene: OfficeScene, ms: number): Promise<void> =>
  new Promise((r) => scene.time.delayedCall(ms, r));

/** Tween "flotante" estándar (yoyo sinusoidal infinito, 700 ms, 6 px) que la
 * guía pide para cualquier icono flotando sobre un escritorio/objeto: el "?"
 * de `floatIcon` y el candado (dibujado a mano con `Graphics`, no sprite) de
 * `robo_pc`. Un solo sitio para esos números en vez de repetirlos. */
export function applyFloat(
  scene: OfficeScene,
  target: { y: number },
  delay = 0,
): Phaser.Tweens.Tween {
  return scene.tweens.add({
    targets: target,
    y: '-=6',
    duration: 700,
    delay,
    yoyo: true,
    repeat: -1,
    ease: Phaser.Math.Easing.Sine.InOut,
  });
}

/** Sprite "?" (frame 11 de sprites/objects.png) flotando con el tween
 * estándar (`applyFloat`). Usado por escenarios que marcan un puesto/objeto
 * "en duda" (renuncia, ransomware, caída de GitHub). Se registra en
 * `scene.scenarioFx` para que `restore()` no necesite limpiarlo a mano
 * (reinicia la escena). */
export function floatIcon(
  scene: OfficeScene,
  x: number,
  y: number,
  tint?: number,
  delay = 0,
): Phaser.GameObjects.Sprite {
  const icon = scene.add.sprite(x, y, 'objects', QUESTION_FRAME).setDepth(1000);
  if (tint !== undefined) icon.setTint(tint);
  applyFloat(scene, icon, delay);
  scene.scenarioFx.push(icon);
  return icon;
}

/** Busca el halo aditivo (textura `glow`) más cercano a un punto dado.
 * `OfficeScene.placeGlows()` los crea como `Image` anónimos -- no viven en
 * `scene.objects` ni en `scene.points` -- así que los runners que necesitan
 * apagarlos o retintarlos (apagón: LEDs del rack a 0; GitHub: rack a rojo)
 * los localizan por posición en vez de por nombre. */
export function nearestGlow(
  scene: OfficeScene,
  x: number,
  y: number,
): Phaser.GameObjects.Image | undefined {
  let best: Phaser.GameObjects.Image | undefined;
  let bestDist = Infinity;
  for (const obj of scene.children.list) {
    if (!(obj instanceof Phaser.GameObjects.Image)) continue;
    if (obj.texture?.key !== GLOW_KEY) continue;
    const d = Phaser.Math.Distance.Between(obj.x, obj.y, x, y);
    if (d < bestDist) {
      bestDist = d;
      best = obj;
    }
  }
  return best;
}

/** Segmento de línea punteada: `[x1, y1, x2, y2]`. */
export type Segment = [number, number, number, number];

/** Segmentos de una línea punteada que traza el perímetro de un rectángulo
 * `w`×`h` (esquina superior izquierda en el origen local `0,0`): `dash` px
 * de trazo y `gap` px de espacio, reiniciando el patrón en cada lado (guía,
 * sección 06 · ROBO DEL PC: "hueco punteado... 4 px dash, 3 px gap por
 * lado"). Puro -- sin Phaser -- para poder testearlo sin un contexto de
 * escena (ver `fx.test.ts`); quien lo usa (`robo_pc.ts`) sólo tiene que
 * recorrer los segmentos con `Graphics#lineBetween`. */
export function dashedRectSegments(
  w: number,
  h: number,
  dash: number,
  gap: number,
): Segment[] {
  const sides: Segment[] = [
    [0, 0, w, 0], // arriba
    [w, 0, w, h], // derecha
    [w, h, 0, h], // abajo
    [0, h, 0, 0], // izquierda
  ];
  const period = dash + gap;
  const segments: Segment[] = [];
  for (const [x1, y1, x2, y2] of sides) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    for (let pos = 0; pos < len; pos += period) {
      const end = Math.min(pos + dash, len);
      segments.push([x1 + ux * pos, y1 + uy * pos, x1 + ux * end, y1 + uy * end]);
    }
  }
  return segments;
}
