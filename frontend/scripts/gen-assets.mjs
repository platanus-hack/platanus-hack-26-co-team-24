// Generates placeholder pixel-art assets for Bus Factor HQ.
// Node built-ins only (zlib for PNG deflate, hand-written PNG chunks + CRC32).
// Real Kenney/LPC art is a drop-in swap later — see public/assets/ATTRIBUTION.md.

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(__dirname, '..', 'public', 'assets');

// ---------- tiny PNG encoder (RGBA8) ----------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = chunk('IHDR', ihdrData);

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = chunk('IDAT', deflateSync(raw));
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

// ---------- pixel canvas helpers ----------

function makeCanvas(w, h) {
  return { w, h, data: Buffer.alloc(w * h * 4, 0) }; // transparent
}

function setPixel(cv, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= cv.w || y >= cv.h) return;
  const i = (y * cv.w + x) * 4;
  cv.data[i] = r;
  cv.data[i + 1] = g;
  cv.data[i + 2] = b;
  cv.data[i + 3] = a;
}

function fillRect(cv, x, y, rw, rh, [r, g, b, a = 255]) {
  for (let yy = y; yy < y + rh; yy++) {
    for (let xx = x; xx < x + rw; xx++) {
      setPixel(cv, xx, yy, r, g, b, a);
    }
  }
}

function darken([r, g, b, a = 255], factor = 0.6) {
  return [Math.round(r * factor), Math.round(g * factor), Math.round(b * factor), a];
}

function writePNG(relPath, cv) {
  const full = join(ASSETS, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, encodePNG(cv.w, cv.h, cv.data));
  console.log('wrote', relPath, `${cv.w}x${cv.h}`);
}

// ---------- tiles/office.png : 8 tiles of 16x16 in a row ----------

const TILE = 16;
const TILE_COLORS = [
  [232, 220, 192, 255], // 0 floor - light beige
  [58, 58, 58, 255], // 1 wall - dark gray
  [139, 90, 43, 255], // 2 desk - brown
  [90, 58, 30, 255], // 3 chair - dark brown
  [26, 26, 26, 255], // 4 coffee machine - black
  [107, 107, 42, 255], // 5 meeting table - olive
  [26, 42, 74, 255], // 6 server - dark blue
  [106, 42, 138, 255], // 7 console - purple
];

function drawTile(cv, ix, color) {
  const x0 = ix * TILE;
  fillRect(cv, x0, 0, TILE, TILE, color);
  const border = darken(color, 0.55);
  // 1px darker border
  for (let x = x0; x < x0 + TILE; x++) {
    setPixel(cv, x, 0, ...border);
    setPixel(cv, x, TILE - 1, ...border);
  }
  for (let y = 0; y < TILE; y++) {
    setPixel(cv, x0, y, ...border);
    setPixel(cv, x0 + TILE - 1, y, ...border);
  }
}

function genTiles() {
  const cv = makeCanvas(TILE * TILE_COLORS.length, TILE);
  TILE_COLORS.forEach((color, i) => drawTile(cv, i, color));
  writePNG('tiles/office.png', cv);
}

// ---------- sprites/objects.png : 12 frames of 16x16 in a row ----------

function drawObjectFrame(cv, ix, bg, indicator) {
  const x0 = ix * TILE;
  fillRect(cv, x0, 0, TILE, TILE, bg);
  const border = darken(bg, 0.55);
  for (let x = x0; x < x0 + TILE; x++) {
    setPixel(cv, x, 0, ...border);
    setPixel(cv, x, TILE - 1, ...border);
  }
  for (let y = 0; y < TILE; y++) {
    setPixel(cv, x0, y, ...border);
    setPixel(cv, x0 + TILE - 1, y, ...border);
  }
  if (indicator) {
    const [ix2, iy2, iw, ih, color] = indicator;
    fillRect(cv, x0 + ix2, iy2, iw, ih, color);
  }
}

function genObjects() {
  const GREEN = [74, 222, 128, 255];
  const RED = [239, 68, 68, 255];
  const CYAN = [103, 232, 249, 255];
  const DIM = [90, 90, 90, 255];

  const frames = [
    // [bg, indicator]
    [[26, 42, 74, 255], [10, 2, 4, 4, GREEN]], // server_on
    [[26, 42, 74, 255], [10, 2, 4, 4, DIM]], // server_off
    [[68, 68, 68, 255], [5, 5, 6, 6, CYAN]], // pc_on
    [[40, 40, 40, 255], null], // pc_off
    [[58, 42, 26, 255], [6, 2, 4, 4, RED]], // coffee_a
    [[58, 42, 26, 255], null], // coffee_b
    [[221, 221, 136, 255], null], // lamp_a (bright)
    [[120, 120, 90, 255], null], // lamp_b (dim)
    [[107, 107, 42, 255], [6, 6, 4, 4, GREEN]], // meet_on
    [[107, 107, 42, 255], [6, 6, 4, 4, RED]], // meet_off
    [[106, 42, 138, 255], [4, 4, 8, 8, [230, 200, 255, 255]]], // console
    [[255, 224, 102, 255], [5, 5, 6, 6, [153, 102, 0, 255]]], // question ("?" -> yellow square, darker center)
  ];

  const cv = makeCanvas(TILE * frames.length, TILE);
  frames.forEach(([bg, indicator], i) => drawObjectFrame(cv, i, bg, indicator));
  writePNG('sprites/objects.png', cv);
}

// ---------- character layers: 4 rows (down,left,right,up) x 3 cols (walk) of 16x24 ----------

const CW = 16;
const CH = 24;
const ROWS = ['down', 'left', 'right', 'up'];
const COLS = 3;

function frameOrigin(row, col) {
  return [col * CW, row * CH];
}

function makeCharSheet() {
  return makeCanvas(CW * COLS, CH * ROWS.length);
}

// body: skin-colored head + torso/legs silhouette, legs animate slightly per walk frame
function drawBody(cv, row, col, skin) {
  const [x0, y0] = frameOrigin(row, col);
  // head 8x8
  fillRect(cv, x0 + 4, y0 + 2, 8, 8, skin);
  // torso 10x9
  fillRect(cv, x0 + 3, y0 + 10, 10, 9, skin);
  // legs: two 3x5 blocks, offset per walk phase for a subtle walk cycle
  const phase = col - 1; // -1, 0, 1
  fillRect(cv, x0 + 4 + phase, y0 + 19, 3, 5, skin);
  fillRect(cv, x0 + 9 - phase, y0 + 19, 3, 5, skin);
}

// clothes: torso block only, grayscale-ish so runtime tint works
function drawClothes(cv, row, col, base) {
  const [x0, y0] = frameOrigin(row, col);
  fillRect(cv, x0 + 3, y0 + 10, 10, 8, base);
}

// hair: cap on top of head; "long" extends down the sides
function drawHair(cv, row, col, color, long) {
  const [x0, y0] = frameOrigin(row, col);
  fillRect(cv, x0 + 4, y0 + 1, 8, 3, color);
  if (long) {
    fillRect(cv, x0 + 3, y0 + 4, 2, 6, color);
    fillRect(cv, x0 + 11, y0 + 4, 2, 6, color);
  }
}

function genCharLayer(name, drawFn) {
  const cv = makeCharSheet();
  ROWS.forEach((_, row) => {
    for (let col = 0; col < COLS; col++) drawFn(cv, row, col);
  });
  writePNG(`sprites/${name}.png`, cv);
}

function genCharacters() {
  genCharLayer('char_body_light', (cv, r, c) => drawBody(cv, r, c, [240, 205, 170, 255]));
  genCharLayer('char_body_dark', (cv, r, c) => drawBody(cv, r, c, [140, 95, 65, 255]));
  genCharLayer('char_hair_short', (cv, r, c) => drawHair(cv, r, c, [90, 60, 30, 255], false));
  genCharLayer('char_hair_long', (cv, r, c) => drawHair(cv, r, c, [30, 25, 20, 255], true));
  // grayscale-ish base clothing colors so runtime tint (paleta) reads cleanly
  genCharLayer('char_clothes_shirt', (cv, r, c) => drawClothes(cv, r, c, [200, 200, 205, 255]));
  genCharLayer('char_clothes_suit', (cv, r, c) => drawClothes(cv, r, c, [190, 190, 195, 255]));
}

// ---------- audio placeholder ----------

function genAudioReadme() {
  const full = join(ASSETS, 'audio', 'README.md');
  mkdirSync(dirname(full), { recursive: true });
  const content = `# Audio (pending)

No audio files are generated by \`gen-assets.mjs\` — synthesizing usable game
audio from scratch is out of scope for placeholders. Drop these 4 files in
this folder before Task 8 (audio + mute):

- \`music.ogg\` — background chiptune loop (played on first click, volume ~0.2).
- \`door.ogg\` — door sound for the "renuncia" scenario.
- \`alarm.ogg\` — alarm loop for the "robo_pc" scenario.
- \`click.ogg\` — UI click feedback (arcade console, buttons).

Suggested CC0 source: Kenney Audio packs (https://kenney.nl/assets?q=audio) or freesound.org (CC0 filter).
`;
  writeFileSync(full, content);
  console.log('wrote audio/README.md');
}

// ---------- ATTRIBUTION.md ----------

function genAttribution() {
  const full = join(ASSETS, 'ATTRIBUTION.md');
  const content = `# Attribution

All art in this folder is **programmatically generated placeholder pixel art**
(solid-color blocks with 1px darker borders), produced by
\`frontend/scripts/gen-assets.mjs\`. It exists so the game is playable and
demoable without shipping third-party binaries in an agent-authored commit.

Real art is intended to be a **drop-in swap**: replace the files below with
matching filenames and frame sizes, no code changes required (frame geometry
is fixed in \`game/config.ts\` / scene code).

## Expected files & frame sizes

### \`tiles/office.png\` — 128x16, 8 tiles of 16x16 in a row
Index 0 floor, 1 wall, 2 desk, 3 chair, 4 coffee machine, 5 meeting table, 6 server, 7 console.

### \`sprites/objects.png\` — 192x16, 12 frames of 16x16 in a row
\`server_on, server_off, pc_on, pc_off, coffee_a, coffee_b, lamp_a, lamp_b, meet_on, meet_off, console, question\`.

### Character layers — each a 4-row x 3-col sheet of 16x24 frames (48x96)
Rows: down, left, right, up. Cols: 3 walk frames.

- \`sprites/char_body_light.png\`, \`sprites/char_body_dark.png\`
- \`sprites/char_hair_short.png\`, \`sprites/char_hair_long.png\`
- \`sprites/char_clothes_shirt.png\`, \`sprites/char_clothes_suit.png\`

Clothing layers are kept light-gray/grayscale-ish so the runtime \`paleta\` tint
(applied via Phaser sprite tint) reads correctly on top of them.

### \`audio/\`
See \`audio/README.md\` — 4 files to be dropped in later (\`music.ogg\`, \`door.ogg\`,
\`alarm.ogg\`, \`click.ogg\`).

## Intended real-art sources (to swap in later)

- **Kenney** (tiles, objects, UI, audio) — CC0. https://kenney.nl — no attribution
  legally required, but credit is nice: "Assets by Kenney (kenney.nl), CC0."
- **LPC (Liberated Pixel Cup)** base/hair/clothes character sprites — CC-BY-SA 3.0
  and/or GPL 3.0 depending on the specific contributor's assets on OpenGameArt.
  When swapped in, list here the exact asset pack(s) used and their authors per
  the license's attribution requirements (e.g. "LPC character base by
  <author>, opengameart.org, CC-BY-SA 3.0").

Until swapped, no external attribution is owed — everything here was generated
by our own script.
`;
  writeFileSync(full, content);
  console.log('wrote ATTRIBUTION.md');
}

// ---------- run ----------

genTiles();
genObjects();
genCharacters();
genAudioReadme();
genAttribution();
