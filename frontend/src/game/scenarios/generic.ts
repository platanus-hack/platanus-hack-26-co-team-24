import type { OfficeScene } from '../OfficeScene';
import { floatIcon, hex, nearestGlow, wait } from './fx';
import { THEME, TILE } from '../palette';
import { sfx } from '../../audio';

const RED = hex(THEME.rojo);
const DESK_COUNT = 9;

/** Runner por defecto: la oficina parpadea en rojo 3 veces (~1.5 s), salvo
 * `apagon` (guía: "todo baja de luminosidad", no un parpadeo rojo -- ese es
 * el idioma visual de emergencia activa, no de un corte de luz). Los
 * escenarios "físicos"/"infra" sin animación propia (`apagon`, `evacuacion`,
 * `caida_meet`, `ransomware`) suman un extra específico via `id` -- el resto
 * cae solo al parpadeo. */
export async function run(
  scene: OfficeScene,
  _personId?: string,
  id?: string,
): Promise<void> {
  if (id !== 'apagon') {
    const overlay = scene.add
      .rectangle(0, 0, scene.map.widthInPixels, scene.map.heightInPixels, RED, 0.35)
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
  }

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

/** Evacuación: cámara tiembla y todo el mundo camina hacia la puerta a la
 * vez (ungated: no pasa por el límite de "máx. 3 moviéndose" de la sala
 * ambiental -- una evacuación real no espera turno). */
async function runIncendio(scene: OfficeScene): Promise<void> {
  scene.cameras.main.shake(500, 0.01);
  const chars = Object.values(scene.characters);
  chars.forEach((c) => c.stopBehavior());
  await Promise.all(chars.map((c) => c.walkTo('door')));
}

/** Apagón (guía, sección 06 · APAGÓN): overlay VOID al 55% sobre toda la
 * sala, con los monitores y la pantalla Meet elevados de profundidad para
 * que sigan brillando a través de la oscuridad, y el rack apagado (frame
 * "caído", sin halo). `restore()` reinicia la escena, así que no hace falta
 * bajar la profundidad de estos objetos a mano al terminar.
 *
 * Nota: la guía también pide que el aura de cada personaje "conserve color"
 * por encima del overlay. `Character.preUpdate()` reafirma `depth = y` en
 * cada frame (fuera del alcance de esta tarea tocar Character.ts), así que
 * no hay forma de mantener el contenedor del personaje por encima de un
 * overlay a depth fijo sin pelear ese reset cuadro a cuadro. Se deja leer
 * -tenue- a través del overlay semitransparente: es exactamente lo que hace
 * el propio mockup de la guía (su aura vive bajo el mismo overlay .55 en el
 * DOM de la sección 06, no por encima). */
async function runApagon(scene: OfficeScene): Promise<void> {
  const overlay = scene.add
    .rectangle(0, 0, scene.map.widthInPixels, scene.map.heightInPixels, hex(THEME.void), 0.55)
    .setOrigin(0)
    .setDepth(900);
  scene.scenarioFx.push(overlay);

  for (const key of ['meet_screen', 'meet_screen_b']) {
    scene.objects[key]?.setDepth(950);
  }
  for (let i = 0; i < DESK_COUNT; i++) {
    scene.objects[`pc_${i}`]?.setDepth(950);
    scene.objects[`pc_frame_${i}`]?.setDepth(950);
  }

  // Los halos aditivos de cada monitor y de la pantalla Meet también viven
  // por debajo del overlay salvo que se eleven a mano (son `Image`
  // anónimos, ver `fx.nearestGlow`): sin esto los biseles se veían
  // encendidos pero sin su resplandor, como si sólo el sprite (no la luz
  // que emite) sobreviviera al apagón.
  for (let i = 0; i < DESK_COUNT; i++) {
    const desk = scene.points[`desk_${i}`];
    if (!desk) continue;
    nearestGlow(scene, desk.x + TILE / 2, desk.y + 4)?.setDepth(950);
  }
  const meet = scene.points['meet_screen'];
  if (meet) {
    nearestGlow(scene, meet.x + TILE, meet.y + TILE / 2)?.setDepth(950);
  }

  // Rack apagado: frame "caído" y su halo lima a 0 (sin LEDs) -- el único
  // que se apaga en vez de elevarse.
  for (const key of ['server', 'server_mid', 'server_top']) {
    const rack = scene.objects[key];
    if (!rack) continue;
    rack.anims.stop();
    rack.setFrame(rack.getData('offFrame') ?? 1);
  }
  const server = scene.points['server'];
  if (server) {
    nearestGlow(scene, server.x + 16, server.y - 16)?.setAlpha(0);
  }

  await wait(scene, 3200);
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

/** Ransomware: todos los PCs quedan teñidos de rojo con un "?" oro flotando
 * encima, como si cada escritorio estuviera cifrado. */
async function runRansomware(scene: OfficeScene): Promise<void> {
  for (let i = 0; i < DESK_COUNT; i++) {
    const pc = scene.objects[`pc_${i}`];
    const desk = scene.points[`desk_${i}`];
    if (!pc || !desk) continue;
    pc.setTint(RED);
    floatIcon(scene, desk.x + TILE / 2, desk.y - TILE * 1.5, hex(THEME.oro), i * 80);
  }

  await wait(scene, 1000);
}
