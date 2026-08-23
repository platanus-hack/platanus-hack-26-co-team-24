import type { OfficeScene } from '../OfficeScene';
import { floatIcon, wait } from './fx';
import { TILE } from '../palette';
import { sfx } from '../../audio';

const RED = 0xff1744;
const DESK_COUNT = 9;

/** Runner por defecto: la oficina parpadea en rojo 3 veces (~1.5 s). Los
 * escenarios "físicos"/"infra" sin animación propia (`apagon`, `evacuacion`,
 * `caida_meet`, `ransomware`) suman un extra específico via `id` — el resto
 * cae solo al parpadeo. */
export async function run(
  scene: OfficeScene,
  _personId?: string,
  id?: string,
): Promise<void> {
  const overlay = scene.add
    .rectangle(
      0,
      0,
      scene.map.widthInPixels,
      scene.map.heightInPixels,
      RED,
      0.35,
    )
    .setOrigin(0)
    .setDepth(1000);
  scene.scenarioFx.push(overlay);

  await new Promise<void>((resolve) => {
    scene.tweens.add({
      targets: overlay,
      alpha: 0,
      duration: 250,
      yoyo: true,
      // 3 parpadeos = 3 ciclos yoyo de 500 ms = 1.5 s (en Phaser `repeat`
      // cuenta ciclos completos ida+vuelta, no medios ciclos).
      repeat: 2,
      onComplete: () => resolve(),
    });
  });
  if (!scene.sys.isActive()) return;
  overlay.destroy();
  const fxIdx = scene.scenarioFx.indexOf(overlay);
  if (fxIdx >= 0) scene.scenarioFx.splice(fxIdx, 1);

  switch (id) {
    case 'evacuacion':
      sfx('shake');
      await runIncendio(scene);
      break;
    case 'apagon':
      sfx('blackout');
      await runApagon(scene);
      break;
    case 'caida_meet':
      sfx('alarm');
      await runMeetCaido(scene);
      break;
    case 'ransomware':
      sfx('alarm');
      await runRansomware(scene);
      break;
    default:
      sfx('alarm');
      break;
  }
}

/** Evacuación: cámara tiembla y todo el mundo camina hacia la puerta. */
async function runIncendio(scene: OfficeScene): Promise<void> {
  scene.cameras.main.shake(500, 0.01);
  const chars = Object.values(scene.characters);
  chars.forEach((c) => c.stopBehavior());
  await Promise.all(chars.map((c) => c.walkTo('door')));
}

/** Se va la luz: overlay negro casi opaco por encima del mapa, con las
 * pantallas (PCs, server, meet) elevadas de profundidad para que "brillen"
 * a través de la oscuridad. `restore()` reinicia la escena, así que no hace
 * falta bajar la profundidad de estos objetos a mano al terminar. */
async function runApagon(scene: OfficeScene): Promise<void> {
  const dark = scene.add
    .rectangle(
      0,
      0,
      scene.map.widthInPixels,
      scene.map.heightInPixels,
      0x000000,
      0.85,
    )
    .setOrigin(0)
    .setDepth(900);
  scene.scenarioFx.push(dark);

  scene.objects['server']?.setDepth(950);
  scene.objects['meet_screen']?.setDepth(950);
  for (let i = 0; i < DESK_COUNT; i++) {
    scene.objects[`pc_${i}`]?.setDepth(950);
  }

  await wait(scene, 1500);
}

/** Meet caído: la pantalla se apaga y "tiembla" un instante. */
async function runMeetCaido(scene: OfficeScene): Promise<void> {
  const meet = scene.objects['meet_screen'];
  if (!meet) return;
  meet.anims.stop();
  meet.setFrame(9); // meet_off

  await new Promise<void>((resolve) => {
    scene.tweens.add({
      targets: meet,
      x: '+=1',
      duration: 50,
      yoyo: true,
      repeat: 20,
      onComplete: () => resolve(),
    });
  });
}

/** Ransomware: todos los PCs quedan teñidos de rojo con un "?" flotando
 * encima, como si cada escritorio estuviera cifrado. */
async function runRansomware(scene: OfficeScene): Promise<void> {
  for (let i = 0; i < DESK_COUNT; i++) {
    const pc = scene.objects[`pc_${i}`];
    const desk = scene.points[`desk_${i}`];
    if (!pc || !desk) continue;
    pc.setTint(RED);
    floatIcon(scene, desk.x + TILE / 2, desk.y - TILE * 1.5, RED, i * 80);
  }

  await wait(scene, 1000);
}
