import Phaser from 'phaser';

const OBJECTS_KEY = 'objects';

// Frame indices in sprites/objects.png (see gen-assets.mjs / ATTRIBUTION.md):
// 0 server_on, 1 server_off, 2 pc_on, 3 pc_off, 4 coffee_a, 5 coffee_b,
// 6 lamp_a, 7 lamp_b, 8 meet_on, 9 meet_off, 10 console, 11 question.
const ANIMS: Array<{ key: string; start: number; end: number; frameRate: number }> = [
  { key: 'server', start: 0, end: 1, frameRate: 2 },
  { key: 'pc', start: 2, end: 3, frameRate: 1 },
  { key: 'coffee', start: 4, end: 5, frameRate: 2 },
  { key: 'lamp', start: 6, end: 7, frameRate: 0.5 },
  { key: 'meet', start: 8, end: 9, frameRate: 1 },
];

const DESK_COUNT = 9;
const LAMP_COLUMNS = [6, 15, 24, 34]; // tile x positions along the ceiling row
const LAMP_ROW = 1; // tile y position (ceiling row)

export class OfficeScene extends Phaser.Scene {
  map!: Phaser.Tilemaps.Tilemap;
  points: Record<string, { x: number; y: number }> = {};
  objects: Record<string, Phaser.GameObjects.Sprite> = {};

  constructor() {
    super('office');
  }

  preload(): void {
    this.load.tilemapTiledJSON('office', '/assets/maps/office.json');
    this.load.image('office-tiles', '/assets/tiles/office.png');
    this.load.spritesheet(OBJECTS_KEY, '/assets/sprites/objects.png', {
      frameWidth: 16,
      frameHeight: 16,
    });
  }

  create(): void {
    this.map = this.make.tilemap({ key: 'office' });
    const tileset = this.map.addTilesetImage('office', 'office-tiles');
    if (!tileset) throw new Error('office tileset failed to load');

    this.map.createLayer('floor', tileset, 0, 0);
    this.map.createLayer('walls', tileset, 0, 0);
    this.map.createLayer('furniture', tileset, 0, 0);
    // collision data is read by the pathfinder later; not rendered.
    this.map.createLayer('collision', tileset, 0, 0)?.setVisible(false);

    this.loadPoints();
    this.createAnimations();
    this.placeObjects();
    this.setupCamera();
  }

  private loadPoints(): void {
    const layer = this.map.getObjectLayer('points');
    for (const obj of layer?.objects ?? []) {
      if (obj.name && obj.x !== undefined && obj.y !== undefined) {
        this.points[obj.name] = { x: obj.x, y: obj.y };
      }
    }
  }

  private createAnimations(): void {
    for (const { key, start, end, frameRate } of ANIMS) {
      if (this.anims.exists(key)) continue;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(OBJECTS_KEY, { start, end }),
        frameRate,
        repeat: -1,
      });
    }
  }

  /** Places a 16x16 sprite so it's centered on the tile at `point`, with an optional vertical pixel offset. */
  private spriteAt(point: { x: number; y: number }, offsetY = 0): Phaser.GameObjects.Sprite {
    return this.add.sprite(point.x + 8, point.y + 8 + offsetY, OBJECTS_KEY);
  }

  private placeObjects(): void {
    const server = this.spriteAt(this.points['server']);
    server.play('server');
    this.objects['server'] = server;

    const meetScreen = this.spriteAt(this.points['meet_screen']);
    meetScreen.play('meet');
    this.objects['meet_screen'] = meetScreen;

    for (let i = 0; i < DESK_COUNT; i++) {
      const desk = this.points[`desk_${i}`];
      if (!desk) continue;
      const pc = this.spriteAt(desk, -8);
      pc.play('pc');
      this.objects[`pc_${i}`] = pc;
    }

    const coffee = this.spriteAt(this.points['coffee']);
    coffee.play('coffee');
    this.objects['coffee'] = coffee;

    const console_ = this.spriteAt(this.points['console']);
    console_.setFrame(10); // console: static frame, no blink animation
    this.objects['console'] = console_;

    LAMP_COLUMNS.forEach((col, i) => {
      const lamp = this.spriteAt({ x: col * 16, y: LAMP_ROW * 16 });
      lamp.play('lamp');
      this.objects[`lamp_${i}`] = lamp;
    });
  }

  private setupCamera(): void {
    const cam = this.cameras.main;
    // Zoom the camera in so the office is viewed up close (the map is exactly
    // the size of the game canvas, so without this the whole map fits in one
    // screen and there is no room left to pan).
    cam.setZoom(2);
    cam.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    // Pan target computed from the actual bounds/viewport instead of a
    // hard-coded pixel value, so it stays correct if the map or zoom change.
    const panTarget = Math.max(0, this.map.widthInPixels - cam.displayWidth);
    this.tweens.add({
      targets: cam,
      scrollX: panTarget,
      duration: 8000,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }
}
