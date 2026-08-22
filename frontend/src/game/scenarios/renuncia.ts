import Phaser from 'phaser';
import type { OfficeScene } from '../OfficeScene';

const TILE = 16;
const GRAY = 0x777777;
const QUESTION_FRAME = 11; // sprites/objects.png -> icono "?"
const QUESTION_OFFSETS = [-10, 0, 10];

const wait = (scene: OfficeScene, ms: number) =>
  new Promise<void>((r) => scene.time.delayedCall(ms, r));

/** Escenario ⭐ del demo: la persona se levanta, camina a la puerta, se
 * desvanece y deja su escritorio apagado (gris) con tres "?" flotando.
 * Dura ~6-8 s según lo largo que sea el camino hasta la puerta. */
export async function run(scene: OfficeScene, personId: string): Promise<void> {
  const char = scene.characters[personId];
  if (!char) return;

  char.stopBehavior();
  char.play('stand');
  await wait(scene, 400);
  if (!scene.sys.isActive()) return;

  await char.walkTo('door');
  if (!scene.sys.isActive()) return;

  await new Promise<void>((resolve) => {
    scene.tweens.add({
      targets: char,
      alpha: 0,
      duration: 600,
      onComplete: () => resolve(),
    });
  });
  if (!scene.sys.isActive()) return;
  char.setVisible(false);

  // El escritorio queda "apagado": PC y mueble en gris.
  scene.objects[`pc_${char.person.desk}`]?.setTint(GRAY);
  const desk = scene.points[`desk_${char.person.desk}`];
  if (desk) {
    const tile = scene.map.getTileAt(
      desk.x / TILE,
      desk.y / TILE,
      false,
      'furniture',
    );
    if (tile) tile.tint = GRAY;
    QUESTION_OFFSETS.forEach((dx, i) => {
      const icon = scene.add
        // -14 px: justo encima del PC (que ocupa desk.y-8 .. desk.y+8), para
        // que los "?" no tapen el escritorio apagado.
        .sprite(desk.x + TILE / 2 + dx, desk.y - 14, 'objects', QUESTION_FRAME)
        .setDepth(1000);
      scene.tweens.add({
        targets: icon,
        y: '-=6',
        duration: 700,
        delay: i * 150,
        yoyo: true,
        repeat: -1,
        ease: Phaser.Math.Easing.Sine.InOut,
      });
      scene.scenarioFx.push(icon);
    });
  }
}
