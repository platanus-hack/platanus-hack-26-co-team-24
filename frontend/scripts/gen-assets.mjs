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

function darken([r, g, b, a = 255], factor = 0.45) {
  return [Math.round(r * factor), Math.round(g * factor), Math.round(b * factor), a];
}

// Move a channel toward white by `factor` (0..1). Used for the cartoon 1px
// top-left highlight (~+35% brightness) — additive-toward-white avoids the
// clipping/banding a flat `c * 1.35` multiply gives on already-bright colors.
function lighten([r, g, b, a = 255], factor = 0.35) {
  const l = (c) => Math.min(255, Math.round(c + (255 - c) * factor));
  return [l(r), l(g), l(b), a];
}

// Pull a color toward mid-gray. Used for "_off"/dim variants so they read as
// visibly de-energized next to their lit counterpart.
function desaturate([r, g, b, a = 255], amount = 0.6) {
  const avg = (r + g + b) / 3;
  const mix = (c) => Math.round(c + (avg - c) * amount);
  return [mix(r), mix(g), mix(b), a];
}

function writePNG(relPath, cv) {
  const full = join(ASSETS, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, encodePNG(cv.w, cv.h, cv.data));
  console.log('wrote', relPath, `${cv.w}x${cv.h}`);
}

// ---------- vibrant cartoon sci-fi palette ----------
// keep in sync with src/game/palette.ts THEME
const COLORS = {
  bg: '#0b0b2b',
  floorA: '#2b2d7a',
  floorB: '#34378f',
  wall: '#120f3a',
  wallEdge: '#00e5ff',
  desk: '#ff7a00',
  deskEdge: '#3a1a00',
  chair: '#ff2e88',
  server: '#00e5ff',
  serverAlt: '#7c4dff',
  coffee: '#ffd600',
  meeting: '#39ff14',
  console: '#ff00aa',
  skinLight: '#ffcc99',
  skinDark: '#8d5524',
  hairDark: '#1a1a1a',
  hairRed: '#ff3d00',
  clothesBase: '#d8d8d8',
  riskLow: '#00ff88',
  riskMid: '#ffea00',
  riskHigh: '#ff1744',
};

function hexToRgba(hex, a = 255) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

function col(name, a = 255) {
  return hexToRgba(COLORS[name], a);
}

// ---------- tiles/office.png : 8 tiles of 16x16 in a row ----------

const TILE = 16;

// Generic "cartoon" bevel: fill + 1px dark outline (all sides) + 1px light
// highlight on the inner top/left edge, so every tile/object reads as a
// raised, outlined block instead of a flat rectangle.
function drawBeveledCell(cv, x0, y0, w, h, fill, opts = {}) {
  const outline = opts.outline || darken(fill, 0.45);
  const highlight = opts.highlight || lighten(fill, 0.35);
  fillRect(cv, x0, y0, w, h, fill);
  for (let x = x0; x < x0 + w; x++) {
    setPixel(cv, x, y0, ...outline);
    setPixel(cv, x, y0 + h - 1, ...outline);
  }
  for (let y = y0; y < y0 + h; y++) {
    setPixel(cv, x0, y, ...outline);
    setPixel(cv, x0 + w - 1, y, ...outline);
  }
  for (let x = x0 + 1; x < x0 + w - 1; x++) setPixel(cv, x, y0 + 1, ...highlight);
  for (let y = y0 + 1; y < y0 + h - 1; y++) setPixel(cv, x0 + 1, y, ...highlight);
}

// floor: 2-tone checkerboard in 8x8 quadrants, no outline (an outlined 16x16
// floor tile reads as a grid of boxes rather than a floor).
function drawFloorTile(cv, ix) {
  const x0 = ix * TILE;
  const a = col('floorA');
  const b = col('floorB');
  fillRect(cv, x0, 0, 8, 8, a);
  fillRect(cv, x0 + 8, 0, 8, 8, b);
  fillRect(cv, x0, 8, 8, 8, b);
  fillRect(cv, x0 + 8, 8, 8, 8, a);
}

function genTiles() {
  const specs = [
    null, // 0 floor - handled separately (checkerboard)
    { fill: col('wall'), outline: col('wallEdge') }, // 1 wall - dark navy, neon cyan trim
    { fill: col('desk'), outline: col('deskEdge') }, // 2 desk - orange, dark umber trim
    { fill: col('chair') }, // 3 chair - hot pink
    { fill: col('coffee') }, // 4 coffee machine - electric yellow
    { fill: col('meeting') }, // 5 meeting table - neon green
    { fill: col('server') }, // 6 server - cyan
    { fill: col('console') }, // 7 console - magenta
  ];

  const cv = makeCanvas(TILE * specs.length, TILE);
  specs.forEach((spec, i) => {
    if (!spec) {
      drawFloorTile(cv, i);
      return;
    }
    drawBeveledCell(cv, i * TILE, 0, TILE, TILE, spec.fill, { outline: spec.outline });
  });
  writePNG('tiles/office.png', cv);
}

// ---------- sprites/objects.png : 12 frames of 16x16 in a row ----------

// A small square "core" with an even brighter inset (the "2px brighter inner
// core") so lit server/meeting/console objects read as glowing.
function drawGlowCore(cv, x0, color, lit) {
  if (lit) {
    fillRect(cv, x0 + 5, 5, 6, 6, color);
    fillRect(cv, x0 + 7, 7, 2, 2, lighten(color, 0.6));
  } else {
    fillRect(cv, x0 + 5, 5, 6, 6, desaturate(darken(color, 0.5), 0.5));
  }
}

function genObjects() {
  const frames = [
    // [housingFill, extra(cv, x0)]
    [darken(col('server'), 0.4), (cv, x0) => drawGlowCore(cv, x0, col('server'), true)], // server_on
    [darken(col('server'), 0.4), (cv, x0) => drawGlowCore(cv, x0, col('server'), false)], // server_off
    [hexToRgba('#252538'), (cv, x0) => fillRect(cv, x0 + 5, 5, 6, 6, col('server'))], // pc_on (screen glow)
    [
      hexToRgba('#252538'),
      (cv, x0) => fillRect(cv, x0 + 5, 5, 6, 6, desaturate(hexToRgba('#111118'), 0.3)),
    ], // pc_off (dark screen)
    [hexToRgba('#3a2a1a'), (cv, x0) => fillRect(cv, x0 + 6, 3, 4, 4, col('coffee'))], // coffee_a (lit)
    [
      hexToRgba('#3a2a1a'),
      (cv, x0) => fillRect(cv, x0 + 6, 3, 4, 4, desaturate(darken(col('coffee'), 0.6), 0.5)),
    ], // coffee_b (dim)
    [lighten(col('coffee'), 0.25), null], // lamp_a (bright)
    [desaturate(darken(col('coffee'), 0.5), 0.6), null], // lamp_b (dim)
    [darken(col('meeting'), 0.5), (cv, x0) => drawGlowCore(cv, x0, col('meeting'), true)], // meet_on
    [darken(col('meeting'), 0.5), (cv, x0) => drawGlowCore(cv, x0, col('meeting'), false)], // meet_off
    [darken(col('console'), 0.4), (cv, x0) => drawGlowCore(cv, x0, col('console'), true)], // console (always lit)
    [col('riskMid'), (cv, x0) => fillRect(cv, x0 + 5, 5, 6, 6, darken(col('riskMid'), 0.4))], // question
  ];

  const cv = makeCanvas(TILE * frames.length, TILE);
  frames.forEach(([bg, extra], i) => {
    const x0 = i * TILE;
    drawBeveledCell(cv, x0, 0, TILE, TILE, bg);
    if (extra) extra(cv, x0);
  });
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

// Fill a rect and outline it with a 1px darkened border, approximating a
// silhouette outline around each body part (cartoon look).
function fillRectOutlined(cv, x, y, w, h, fill) {
  fillRect(cv, x, y, w, h, fill);
  const outline = darken(fill, 0.45);
  for (let xx = x; xx < x + w; xx++) {
    setPixel(cv, xx, y, ...outline);
    setPixel(cv, xx, y + h - 1, ...outline);
  }
  for (let yy = y; yy < y + h; yy++) {
    setPixel(cv, x, yy, ...outline);
    setPixel(cv, x + w - 1, yy, ...outline);
  }
}

// body: skin-colored head + torso/legs silhouette, legs animate slightly per walk frame
function drawBody(cv, row, col, skin) {
  const [x0, y0] = frameOrigin(row, col);
  // head 8x8
  fillRectOutlined(cv, x0 + 4, y0 + 2, 8, 8, skin);
  // torso 10x9
  fillRectOutlined(cv, x0 + 3, y0 + 10, 10, 9, skin);
  // legs: two 3x5 blocks, offset per walk phase for a subtle walk cycle
  const phase = col - 1; // -1, 0, 1
  fillRectOutlined(cv, x0 + 4 + phase, y0 + 19, 3, 5, skin);
  fillRectOutlined(cv, x0 + 9 - phase, y0 + 19, 3, 5, skin);
}

// clothes: torso block only, light gray so runtime tint (paleta) reads vivid
function drawClothes(cv, row, col, base) {
  const [x0, y0] = frameOrigin(row, col);
  fillRectOutlined(cv, x0 + 3, y0 + 10, 10, 8, base);
}

// hair: cap on top of head; "long" extends down the sides
function drawHair(cv, row, col, color, long) {
  const [x0, y0] = frameOrigin(row, col);
  fillRectOutlined(cv, x0 + 4, y0 + 1, 8, 3, color);
  if (long) {
    fillRectOutlined(cv, x0 + 3, y0 + 4, 2, 6, color);
    fillRectOutlined(cv, x0 + 11, y0 + 4, 2, 6, color);
  }
}

function genCharLayer(name, drawFn) {
  const cv = makeCharSheet();
  ROWS.forEach((_, row) => {
    for (let colIdx = 0; colIdx < COLS; colIdx++) drawFn(cv, row, colIdx);
  });
  writePNG(`sprites/${name}.png`, cv);
}

function genCharacters() {
  genCharLayer('char_body_light', (cv, r, c) => drawBody(cv, r, c, col('skinLight')));
  genCharLayer('char_body_dark', (cv, r, c) => drawBody(cv, r, c, col('skinDark')));
  genCharLayer('char_hair_short', (cv, r, c) => drawHair(cv, r, c, col('hairDark'), false));
  genCharLayer('char_hair_long', (cv, r, c) => drawHair(cv, r, c, col('hairRed'), true));
  // light-gray base clothing so the runtime tint (paleta) reads cleanly and vividly
  genCharLayer('char_clothes_shirt', (cv, r, c) => drawClothes(cv, r, c, col('clothesBase')));
  genCharLayer('char_clothes_suit', (cv, r, c) => drawClothes(cv, r, c, col('clothesBase')));
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
