import type Phaser from 'phaser';
import type { OfficeScene } from '../OfficeScene';
import { floatIcon, nearestGlow, wait } from './fx';
import { THEME } from '../palette';
import { sfx } from '../../audio';

const SMOKE_KEY = 'smoke';
const SMOKE_TINTS = [0x9e9e9e, 0xcfd8dc];
const DEV_ROLES = /Backend|Frontend|DevOps/i;
const DEV_COUNT = 2; // guía: "exactamente dos devs se levantan"
const LAMP_COUNT = 3; // ver OfficeScene.LAMP_COLUMNS
// Humo "en dos tiempos" (guía): una tanda de 1.2s, pausa de 0.6s, otra
// tanda de 1.2s.
const SMOKE_BURST_MS = 1200;
const SMOKE_PAUSE_MS = 600;
const DEV_ICON_OFFSET_Y = -34; // sobre la cabeza, misma altura que la etiqueta de riesgo

const hex = (s: string): number => parseInt(s.slice(1), 16);

/** GitHub caído (guía, sección 06 · CAÍDA DE GITHUB): el rack se pone rojo y
 * apagado, humea en dos tandas separadas por una pausa, y exactamente dos
 * devs se levantan con un "?" flotando sobre la cabeza y caminan al rack.
 * Dura ~4-5 s (el humo solo ya son 3s, corriendo en paralelo con la
 * caminata de los devs). */
export async function run(scene: OfficeScene): Promise<void> {
  sfx('smoke');

  // El rack es una torre de 3 segmentos (ver OfficeScene.RACK_SEGMENTS). Cada
  // sprite sabe cuál es su frame "caído" (`offFrame`), así que este runner no
  // necesita conocer la geometría de la torre. El tinte rojo es permanente
  // (no un destello): "el lima del rack se vuelve rojo".
  const racks = ['server', 'server_mid', 'server_top']
    .map((k) => scene.objects[k])
    .filter(Boolean);
  for (const rack of racks) {
    rack.anims.stop();
    rack.setFrame(rack.getData('offFrame') ?? 1);
    rack.setTint(hex(THEME.rojo));
  }
  const server = racks[0];

  // El halo aditivo del rack (lima) también se retiñe a rojo: `placeGlows()`
  // lo crea como `Image` anónimo, sin nombre en `scene.objects`, así que se
  // localiza por posición (ver `fx.nearestGlow`).
  const serverPoint = scene.points['server'];
  if (serverPoint) {
    nearestGlow(scene, serverPoint.x + 16, serverPoint.y - 16)?.setTint(
      hex(THEME.rojo),
    );
  }

  for (let i = 0; i < LAMP_COUNT; i++) {
    scene.objects[`lamp_${i}`]?.setTint(hex(THEME.rojo));
  }

  if (!scene.textures.exists(SMOKE_KEY)) {
    scene.textures.generate(SMOKE_KEY, {
      data: ['2222', '2222', '2222', '2222'],
      pixelWidth: 1,
      // Palette type demands los 16 índices (0-9A-F); sólo usamos el "2".
      palette: { 2: '#9e9e9e' } as Phaser.Types.Create.Palette,
    });
  }

  // Dos devs se levantan con un "?" flotando (ORO) y caminan al rack, en
  // paralelo con el humo de abajo (para que se vean juntos, como en la
  // guía: no uno después del otro).
  const devs = Object.values(scene.characters)
    .filter((c) => DEV_ROLES.test(c.person.rol))
    .slice(0, DEV_COUNT);
  devs.forEach((c) => {
    c.stopBehavior();
    c.play('stand');
    floatIcon(scene, c.x, c.y + DEV_ICON_OFFSET_Y, hex(THEME.oro));
  });
  const devsWalking = Promise.all(devs.map((c) => c.walkTo('server')));

  if (server) {
    const spawnBurst = (): Phaser.GameObjects.Particles.ParticleEmitter => {
      const emitter = scene.add
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
      scene.scenarioFx.push(emitter);
      return emitter;
    };

    const burst1 = spawnBurst();
    await wait(scene, SMOKE_BURST_MS);
    if (!scene.sys.isActive()) return;
    burst1.stop();

    await wait(scene, SMOKE_PAUSE_MS);
    if (!scene.sys.isActive()) return;

    const burst2 = spawnBurst();
    await wait(scene, SMOKE_BURST_MS);
    if (!scene.sys.isActive()) return;
    burst2.stop();
  }

  await devsWalking;
  if (!scene.sys.isActive()) return;
  devs.forEach((c) => c.play('idle'));
}
