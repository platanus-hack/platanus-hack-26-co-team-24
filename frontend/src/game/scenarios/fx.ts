import Phaser from 'phaser';
import type { OfficeScene } from '../OfficeScene';

const QUESTION_FRAME = 11; // sprites/objects.png -> icono "?"

/** Espera `ms` respetando el reloj de la escena (para que `scene.time`
 * pausado/destruido no deje promesas colgadas). Compartido por todos los
 * runners de escenario. */
export const wait = (scene: OfficeScene, ms: number): Promise<void> =>
  new Promise((r) => scene.time.delayedCall(ms, r));

/** Sprite "?" (frame 11 de sprites/objects.png) flotando con un tween
 * sinusoidal infinito. Usado por escenarios que marcan un puesto/objeto
 * "en duda" (renuncia, ransomware). Se registra en `scene.scenarioFx` para
 * que `restore()` no necesite limpiarlo a mano (reinicia la escena). */
export function floatIcon(
  scene: OfficeScene,
  x: number,
  y: number,
  tint?: number,
  delay = 0,
): Phaser.GameObjects.Sprite {
  const icon = scene.add.sprite(x, y, 'objects', QUESTION_FRAME).setDepth(1000);
  if (tint !== undefined) icon.setTint(tint);
  scene.tweens.add({
    targets: icon,
    y: '-=6',
    duration: 700,
    delay,
    yoyo: true,
    repeat: -1,
    ease: Phaser.Math.Easing.Sine.InOut,
  });
  scene.scenarioFx.push(icon);
  return icon;
}
