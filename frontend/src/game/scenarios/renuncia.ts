import type { OfficeScene } from '../OfficeScene';
import { floatIcon, wait } from './fx';
import { THEME, TILE } from '../palette';
import { sfx } from '../../audio';

const hex = (s: string): number => parseInt(s.slice(1), 16);
// Escritorio "apagado" = tinte LINE (guía), no un gris genérico fuera de
// los 11 colores de la paleta Synth Dusk.
const GRAY = hex(THEME.line);
const QUESTION_OFFSETS = [-TILE / 2, 0, TILE / 2];

/** Escenario ⭐ del demo: la persona se levanta, camina a la puerta, se
 * desvanece y deja su escritorio apagado (gris) con tres "?" flotando.
 * Dura ~6-8 s según lo largo que sea el camino hasta la puerta. */
export async function run(scene: OfficeScene, personId: string): Promise<void> {
  const char = scene.characters[personId];
  if (!char) {
    console.warn('renuncia: persona no encontrada', personId);
    return;
  }

  char.stopBehavior();
  char.play('stand');
  await wait(scene, 400);
  if (!scene.sys.isActive()) return;

  await char.walkTo('door');
  if (!scene.sys.isActive()) return;
  sfx('door');

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

  // El escritorio queda "apagado": PC, bisel y mueble en gris. El tablero son
  // dos sprites (`desk_i` y `desk_i_b`, ver OfficeScene.placeObjects), no
  // tiles de la capa `furniture`.
  const deskIdx = char.person.desk;
  for (const key of [
    `pc_${deskIdx}`,
    `pc_frame_${deskIdx}`,
    `desk_${deskIdx}`,
    `desk_${deskIdx}_b`,
  ]) {
    scene.objects[key]?.setTint(GRAY);
  }
  const desk = scene.points[`desk_${deskIdx}`];
  if (desk) {
    QUESTION_OFFSETS.forEach((dx, i) => {
      // Sobre la silla vacía (una fila por encima de la mesa), que es donde
      // el ojo va a buscar a quien ya no está.
      floatIcon(
        scene,
        desk.x + TILE / 2 + dx,
        desk.y - TILE,
        hex(THEME.oro),
        i * 150,
      );
    });
  }
}
