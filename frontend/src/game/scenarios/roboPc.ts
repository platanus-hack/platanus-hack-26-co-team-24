import type { OfficeScene } from '../OfficeScene';
import { wait } from './fx';

const RED = 0xff1744;
const LAMP_COUNT = 4;
const LAMP_BLINKS = 6; // 6 medios-ciclos = 3 parpadeos completos
const LAMP_INTERVAL_MS = 300;

/** Robo de laptop: el PC del CTO (desk 0) desaparece y una alarma roja
 * (círculo + haz rotando) queda sobre el escritorio vacío mientras las
 * luces titilan en rojo. Dura ~3 s. */
export async function run(scene: OfficeScene): Promise<void> {
  const pc = scene.objects['pc_0'];
  pc?.setVisible(false);

  const x = pc?.x ?? scene.points['cto_pc']?.x ?? 0;
  const y = pc?.y ?? scene.points['cto_pc']?.y ?? 0;

  const alarm = scene.add.circle(x, y, 14, RED, 0.3).setDepth(600);
  scene.scenarioFx.push(alarm);

  const beam = scene.add
    .rectangle(x, y, 28, 3, RED, 0.6)
    .setOrigin(0, 0.5)
    .setDepth(601);
  scene.scenarioFx.push(beam);
  scene.tweens.add({
    targets: beam,
    angle: 360,
    duration: 1200,
    repeat: -1,
  });

  const cto = Object.values(scene.characters).find((c) => c.person.desk === 0);
  cto?.stopBehavior();
  cto?.play('stand');

  for (let i = 0; i < LAMP_BLINKS; i++) {
    await wait(scene, LAMP_INTERVAL_MS);
    if (!scene.sys.isActive()) return;
    const on = i % 2 === 0;
    for (let j = 0; j < LAMP_COUNT; j++) {
      const lamp = scene.objects[`lamp_${j}`];
      if (on) lamp?.setTint(RED);
      else lamp?.clearTint();
    }
  }
}
