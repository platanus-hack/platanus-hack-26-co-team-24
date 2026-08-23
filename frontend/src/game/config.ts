import Phaser from 'phaser';
import { OfficeScene } from './OfficeScene';
import { THEME, MAP_W, MAP_H } from './palette';

export const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  pixelArt: true,
  roundPixels: true,
  // Valores iniciales; `Scale.RESIZE` los sobreescribe con el tamaño real del
  // contenedor (que es el viewport completo) en cuanto arranca el juego.
  width: MAP_W,
  height: MAP_H,
  backgroundColor: THEME.void,
  scale: {
    // RESIZE (no FIT): el canvas ocupa siempre toda la ventana, sin barras
    // negras del elemento ni centrado por CSS. La sala se escala con zoom
    // ENTERO (píxeles nítidos) y se centra desde la cámara en OfficeScene.
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
  },
  scene: [OfficeScene],
};
