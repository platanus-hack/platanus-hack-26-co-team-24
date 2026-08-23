import type { OfficeScene } from '../OfficeScene';
import { applyFloat, dashedRectSegments, hex, wait } from './fx';
import { THEME } from '../palette';
import { sfx } from '../../audio';

// Color exacto de la guía (11 colores): antes se usaba un rojo suelto
// (0xff1744) fuera de la paleta Synth Dusk.
const RED = 0xff2e63;
const HOLE_SIZE = 32; // el hueco cubre el tile 32x32 del monitor
const HOLE_DASH = 4;
const HOLE_GAP = 3;
const LOCK_W = 10;
const LOCK_H = 8;
const LOCK_RADIUS = 4;
// El punto `cto_pc` es el escritorio 0, arriba-izquierda del mapa -- justo
// donde vive el HUD fijo ("OFICINA <NOMBRE>" + mute, ver Hud.tsx). Flotando
// ARRIBA del monitor el candado caía debajo de esa tarjeta y no se veía, así
// que baja al tablero del escritorio (por debajo de la tarjeta y del haz
// giratorio), todavía sobre el mismo puesto comprometido.
const LOCK_OFFSET_X = 24;
const LOCK_OFFSET_Y = 40;
const LAMP_COUNT = 3; // ver OfficeScene.LAMP_COLUMNS
const LAMP_BLINKS = 6; // 6 medios-ciclos = 3 parpadeos completos
const LAMP_INTERVAL_MS = 500; // 6 * 500ms = 3s (guía: "≈3 s")

/** Robo de laptop (guía, sección 06 · ROBO DEL PC): el PC del CTO (desk 0)
 * desaparece y deja un hueco punteado rosa, con un haz rojo girando y un
 * candado oro flotando sobre los accesos comprometidos, mientras las luces
 * titilan en rojo 3 veces. Dura ~3 s. */
export async function run(scene: OfficeScene): Promise<void> {
  sfx('alarm');
  const pc = scene.objects['pc_0'];
  const frame = scene.objects['pc_frame_0'];
  const x = pc?.x ?? scene.points['cto_pc']?.x ?? 0;
  const y = pc?.y ?? scene.points['cto_pc']?.y ?? 0;
  pc?.setVisible(false);
  frame?.setVisible(false);

  // Hueco punteado: perímetro de 32x32 en trazos de 4px con 3px de espacio
  // (guía), rosa. `dashedRectSegments` es puro (ver fx.test.ts); aquí sólo
  // se recorre para pintar cada segmento con `lineBetween`.
  const hole = scene.add
    .graphics({ x: x - HOLE_SIZE / 2, y: y - HOLE_SIZE / 2 })
    .setDepth(y);
  hole.lineStyle(1, hex(THEME.rosa), 1);
  for (const [x1, y1, x2, y2] of dashedRectSegments(
    HOLE_SIZE,
    HOLE_SIZE,
    HOLE_DASH,
    HOLE_GAP,
  )) {
    hole.lineBetween(x1, y1, x2, y2);
  }
  scene.scenarioFx.push(hole);

  // Haz rojo giratorio (se mantiene tal cual estaba: sigue leyéndose bien).
  const beam = scene.add
    .rectangle(x, y, 44, 3, RED, 0.6)
    .setOrigin(0, 0.5)
    .setDepth(601);
  scene.scenarioFx.push(beam);
  scene.tweens.add({
    targets: beam,
    angle: 360,
    duration: 1200,
    repeat: -1,
  });

  // Candado oro sobre los accesos comprometidos: cuerpo (rect ORO) + arco
  // (grillete) dibujados a mano, flotando con el mismo tween que los "?"
  // (`fx.applyFloat`) ya que no hay glifo de candado en objects.png.
  const lock = scene.add
    .graphics({ x: x + LOCK_OFFSET_X, y: y + LOCK_OFFSET_Y })
    .setDepth(1000);
  lock.fillStyle(hex(THEME.oro), 1);
  lock.fillRect(-LOCK_W / 2, -LOCK_H / 2, LOCK_W, LOCK_H);
  lock.lineStyle(2, hex(THEME.oro), 1);
  lock.beginPath();
  lock.arc(0, -LOCK_H / 2, LOCK_RADIUS, Math.PI, Math.PI * 2, false);
  lock.strokePath();
  scene.scenarioFx.push(lock);
  applyFloat(scene, lock);

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
