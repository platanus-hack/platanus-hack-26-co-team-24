import type Phaser from 'phaser';
import type { OfficeScene } from '../OfficeScene';
import { wait } from './fx';

const RED = 0xff1744;
const SMOKE_KEY = 'smoke';
const DEV_ROLES = /Backend|Frontend|DevOps/i;
const LAMP_COUNT = 4;

/** GitHub caído: el servidor "humea" (no hay incendio real, pero sí una
 * caída total de la plataforma), las luces titilan en rojo y los devs del
 * equipo corren hacia el server a intentar algo. Dura ~5-8 s. */
export async function run(scene: OfficeScene): Promise<void> {
  const server = scene.objects['server'];
  if (server) {
    server.anims.stop();
    server.setFrame(1); // server_off
  }

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
        speedY: { min: -30, max: -15 },
        speedX: { min: -8, max: 8 },
        lifespan: 1200,
        frequency: 90,
        scale: { start: 1, end: 2.5 },
        alpha: { start: 0.8, end: 0 },
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
