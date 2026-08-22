import type { OfficeScene } from '../OfficeScene';

/** Runner por defecto para escenarios sin animación propia todavía: la
 * oficina parpadea en rojo 3 veces (~1.5 s). */
export async function run(scene: OfficeScene): Promise<void> {
  const overlay = scene.add
    .rectangle(
      0,
      0,
      scene.map.widthInPixels,
      scene.map.heightInPixels,
      0xff1744,
      0.35,
    )
    .setOrigin(0)
    .setDepth(1000);

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

  overlay.destroy();
}
