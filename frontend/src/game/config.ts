import Phaser from 'phaser';
import { OfficeScene } from './OfficeScene';
import { THEME } from './palette';

export const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  pixelArt: true,
  zoom: 2,
  width: 736,
  height: 416,
  backgroundColor: THEME.void,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [OfficeScene],
};
