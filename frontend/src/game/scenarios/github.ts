import type Phaser from 'phaser';
import type { OfficeScene } from '../OfficeScene';
import { wait } from './fx';
import { sfx } from '../../audio';

const RED = 0xff1744;
const SMOKE_KEY = 'smoke';
const SMOKE_TINTS = [0x9e9e9e, 0xcfd8dc];
const DEV_ROLES = /Backend|Frontend|DevOps/i;
const LAMP_COUNT = 3; // ver OfficeScene.LAMP_COLUMNS

/** GitHub caído: el servidor destella en rojo, "humea" (no hay incendio
 * real, pero sí una caída total de la plataforma) con dos tonos de gris
 * para que se note, las luces titilan en rojo y los devs del equipo corren
 * hacia el server a intentar algo. Dura ~5-8 s. */
export async function run(scene: OfficeScene): Promise<void> {
  sfx('smoke');
  // El rack son dos cuerpos apilados (ver OfficeScene.placeObjects).
  const racks = ['server', 'server_top']
    .map((k) => scene.objects[k])
    .filter(Boolean);
  for (const rack of racks) {
    // Destello rojo breve antes de quedar "apagado" (frame 1): más
    // llamativo que un simple corte de frame.
    rack.anims.stop();
    rack.setTint(RED);
  }
  if (racks.length) {
    await wait(scene, 200);
    if (!scene.sys.isActive()) return;
    for (const rack of racks) {
      rack.setFrame(1); // server_off
      rack.clearTint();
    }
  }
  const server = racks[0];

  if (!scene.textures.exists(SMOKE_KEY)) {
    scene.textures.generate(SMOKE_KEY, {
      data: ['2222', '2222', '2222', '2222'],
      pixelWidth: 1,
      // Palette type demands los 16 índices (0-9A-F); sólo usamos el "2".
      palette: { 2: '#9e9e9e' } as Phaser.Types.Create.Palette,
    });
  }

  if (server) {
    const smoke = scene.add
      .particles(server.x, server.y - 8, SMOKE_KEY, {
        speedY: { min: -40, max: -20 },
        speedX: { min: -12, max: 12 },
        lifespan: 1600,
        frequency: 50,
        scale: { start: 1.5, end: 4.5 },
        alpha: { start: 0.95, end: 0 },
        tint: SMOKE_TINTS,
      })
      .setDepth(500);
    scene.scenarioFx.push(smoke);
  }

  for (let i = 0; i < LAMP_COUNT; i++) {
    scene.objects[`lamp_${i}`]?.setTint(RED);
  }

  await wait(scene, 300);
  if (!scene.sys.isActive()) return;

  const devs = Object.values(scene.characters).filter((c) =>
    DEV_ROLES.test(c.person.rol),
  );
  devs.forEach((c) => {
    c.stopBehavior();
    c.play('stand');
  });

  await Promise.all(devs.map((c) => c.walkTo('server')));
  if (!scene.sys.isActive()) return;
  devs.forEach((c) => c.play('idle'));

  await wait(scene, 1500);
}
