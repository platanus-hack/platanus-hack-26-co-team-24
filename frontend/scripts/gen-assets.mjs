// Genera el pixel art de Bus Factor HQ dibujando las recetas de la guía de
// arte "Synth Dusk" de Claude Design (docs/design/guia-visual.dc.html,
// secciones 03 TILES · 32PX y 04 SPRITE SHEET). La guía muestra cada pieza a
// 2x dentro de cajas de 64 px: todas las coordenadas de aquí son las suyas
// divididas por 2.
// Sólo built-ins de Node (zlib para el deflate del PNG + chunks/CRC32 a mano).

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

function writePNG(relPath, cv) {
  const full = join(ASSETS, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, encodePNG(cv.w, cv.h, cv.data));
  console.log('wrote', relPath, `${cv.w}x${cv.h}`);
}

// ---------- paleta Synth Dusk ----------
// Espejo manual de src/game/palette.ts THEME (un script Node standalone no
// puede importar TS). Los hex "de dibujo" (floorA/B, deskTop, chairSeat...)
// salen literalmente del CSS de la guía, divididos por 2 donde son medidas.

const COLORS = {
  void: '#120A20',
  base: '#1A0F2E',
  surface: '#241543',
  line: '#43276B',
  turquesa: '#2BD9D0',
  rosa: '#FF4D9D',
  lima: '#B6FF3C',
  oro: '#FFD166',
  naranja: '#FF7A2F',
  lila: '#A98BFF',
  morado: '#7B3FE4',
  rojo: '#FF2E63',
  texto: '#F3E8FF',
  texto2: '#A98CD6',

  // --- Recetas de la guía (sección 03 · TILES 32PX) ---
  floorA: '#2A1747', // damero, tono A
  floorB: '#331D53', // damero, tono B
  wallFill: '#4B2170', // muro, franja ancha
  wallLine: '#3A1959', // muro, junta oscura
  deskTop: '#A98BFF', // = lila, canto superior del escritorio
  deskBody: '#6E4FA8', // cuerpo del escritorio / mesa de juntas
  chairSeat: '#FF7A2F', // = naranja
  chairBase: '#B7561F', // naranja quemado (base de la silla)
  screenOff: '#3A1959', // fondo de la pantalla del monitor encendido
  screenDead: '#241543', // = surface, pantalla apagada
  rackBox: '#1F2B12', // caja del rack GitHub
  legs: '#331D53', // pantalón de todos los personajes (guía sección 04)
  skinLight: '#E8B98A',
  skinLightShade: '#C98A5E', // nuca / vista de espalda (piel clara)
  skinDark: '#8A5C3E',
  skinDarkShade: '#6E4630', // nuca / vista de espalda (piel oscura)
  tintable: '#d8d8d8', // pelo y ropa: gris claro para tintar en runtime
};

function hexToRgba(hex, a = 255) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

function col(name, a = 255) {
  return hexToRgba(COLORS[name], a);
}

/** Mezcla `fg` sobre `bg` con opacidad `alpha`. La guía usa `opacity: .3/.4`
 * en los LEDs apagados del rack; el PNG es opaco, así que se pre-mezcla. */
function over(fg, bg, alpha) {
  return [
    Math.round(fg[0] * alpha + bg[0] * (1 - alpha)),
    Math.round(fg[1] * alpha + bg[1] * (1 - alpha)),
    Math.round(fg[2] * alpha + bg[2] * (1 - alpha)),
    255,
  ];
}

/** Marco de `t` px de grosor (la guía dibuja bordes planos, no biseles). */
function strokeRect(cv, x, y, w, h, t, color) {
  fillRect(cv, x, y, w, t, color);
  fillRect(cv, x, y + h - t, w, t, color);
  fillRect(cv, x, y, t, h, color);
  fillRect(cv, x + w - t, y, t, h, color);
}

function fillCircle(cv, cx, cy, r, color) {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      if (dx * dx + dy * dy <= r * r) setPixel(cv, x, y, ...color);
    }
  }
}

// ---------- tiles/office.png : 12 tiles de 32x32 en fila (384x32) ----------
//
// Orden fijo (lo consume scripts/gen-map.mjs vía GID = índice + 1):
//   0 piso · 1 muro · 2 escritorio · 3 silla · 4 monitor_on · 5 monitor_off
//   6 rack · 7 cafetera · 8 puerta · 9 lámpara · 10 pantalla_meet · 11 planta
//
// Los tiles de mobiliario tienen FONDO TRANSPARENTE a propósito: se pintan en
// la capa `furniture`, encima de la capa `floor`, igual que en el mockup de
// la guía (sección 05), donde los muebles se apoyan sobre el damero sin caja
// oscura alrededor. El recuadro `#43276B` de las muestras de la sección 03 es
// el marco de la muestra, no parte del tile: el mockup no dibuja rejilla
// alguna sobre el piso.

const TILE = 32;

/** Un segmento del rack GitHub. El rack del mockup es una torre de 3 celdas,
 * así que los segmentos se apilan: sólo llevan borde LIMA a izquierda y
 * derecha, y los de los extremos (`cap`) añaden la tapa superior (el de abajo
 * se dibuja con `setFlipY`). Repartido así, la torre completa enseña 4 filas
 * de LEDs, como el mockup. `live` = LEDs sanos; si no, todo se apaga a rojo.
 *
 * `rows`: posiciones Y de las filas de LEDs dentro del segmento. */
function drawRackSegment(cv, x0, { live, cap, rows }) {
  const box = col('rackBox');
  const edge = live ? col('lima') : col('rojo');
  fillRect(cv, x0, 0, 32, 32, box);
  fillRect(cv, x0, 0, 2, 32, edge);
  fillRect(cv, x0 + 30, 0, 2, 32, edge);
  if (cap) fillRect(cv, x0, 0, 32, 2, edge);

  const lima = live ? col('lima') : over(col('rojo'), box, 0.6);
  const turq = live ? col('turquesa') : over(col('rojo'), box, 0.35);
  // Patrón de la guía: lima / lima .3 / turquesa, alternado en la fila par.
  const PATTERN = [
    [lima, over(lima, box, 0.3), turq],
    [over(lima, box, 0.3), lima, over(turq, box, 0.4)],
  ];
  rows.forEach((y, i) => {
    PATTERN[i % 2].forEach((c, j) => fillRect(cv, x0 + 8 + j * 6, y, 4, 4, c));
    fillRect(cv, x0 + 6, y + 8, 20, 2, col('line'));
  });
}

/** Rack de una sola celda: el tile 6 del tileset (el mapa usa los sprites
 * apilados de objects.png, pero el tile sigue en la tira por contrato). */
function drawRack(cv, x0, live) {
  drawRackSegment(cv, x0, { live, cap: true, rows: [6, 20] });
  fillRect(cv, x0, 30, 32, 2, live ? col('lima') : col('rojo'));
}

const TILE_DRAW = [
  // 0 · PISO: damero 16x16. `repeating-conic-gradient(#2A1747 0 25%, #331D53
  // 0 50%)` arranca a las 12 y gira en horario -> arriba-derecha y
  // abajo-izquierda son el tono A; arriba-izquierda y abajo-derecha el B.
  (cv, x0) => {
    fillRect(cv, x0, 0, 16, 16, col('floorB'));
    fillRect(cv, x0 + 16, 0, 16, 16, col('floorA'));
    fillRect(cv, x0, 16, 16, 16, col('floorA'));
    fillRect(cv, x0 + 16, 16, 16, 16, col('floorB'));
  },
  // 1 · MURO: franjas #4B2170 con juntas #3A1959 de 2 px cada 32 px. La guía
  // declara dos `repeating-linear-gradient` (90deg y 0deg), pero el de 90deg
  // va primero y es opaco: lo que el mockup dibuja de verdad son sólo las
  // juntas verticales, una por celda.
  (cv, x0) => {
    fillRect(cv, x0, 0, 32, 32, col('wallFill'));
    fillRect(cv, x0 + 30, 0, 2, 32, col('wallLine'));
  },
  // 2 · ESCRITORIO: tablero a todo el ancho (dos tiles contiguos forman una
  // mesa de 64 px como en el mockup) con canto superior LILA de 3 px. El
  // mockup dibuja la mesa de 66 px a 2x = 33 px, o sea prácticamente el alto
  // completo de la celda: ocupa de y=10 al borde inferior.
  (cv, x0) => {
    fillRect(cv, x0, 10, 32, 22, col('deskBody'));
    fillRect(cv, x0, 10, 32, 3, col('deskTop'));
  },
  // 3 · SILLA: respaldo NARANJA 14x11 en (9,8) + base 10x6 en (11,19).
  (cv, x0) => {
    fillRect(cv, x0 + 9, 8, 14, 11, col('chairSeat'));
    fillRect(cv, x0 + 11, 19, 10, 6, col('chairBase'));
  },
  // 4 · MONITOR ON: pantalla 22x15 en (5,7), borde 2 px TURQUESA, peana 8x4
  // en (12,22). El glow NO va horneado: lo pone OfficeScene (aditivo).
  (cv, x0) => {
    fillRect(cv, x0 + 5, 7, 22, 15, col('screenOff'));
    strokeRect(cv, x0 + 5, 7, 22, 15, 2, col('turquesa'));
    fillRect(cv, x0 + 12, 22, 8, 4, col('line'));
  },
  // 5 · MONITOR OFF: misma geometría, SURFACE con borde LINE.
  (cv, x0) => {
    fillRect(cv, x0 + 5, 7, 22, 15, col('screenDead'));
    strokeRect(cv, x0 + 5, 7, 22, 15, 2, col('line'));
    fillRect(cv, x0 + 12, 22, 8, 4, col('line'));
  },
  // 6 · RACK GITHUB: caja #1F2B12, borde 2 px LIMA, dos filas de 3 LEDs 4x4
  // separadas por una línea LINE (los apagados van al 30-40 % de opacidad).
  (cv, x0) => drawRack(cv, x0, true),
  // 7 · CAFETERA: SURFACE con borde 2 px #A98CD6, barra ROSA 18x5 en (7,5),
  // taza ORO 12x9 en (10,16).
  (cv, x0) => {
    fillRect(cv, x0, 0, 32, 32, col('surface'));
    strokeRect(cv, x0, 0, 32, 32, 2, col('texto2'));
    fillRect(cv, x0 + 7, 5, 18, 5, col('rosa'));
    fillRect(cv, x0 + 10, 16, 12, 9, col('oro'));
  },
  // 8 · PUERTA: NARANJA con pomo ORO 4x4 y marco ORO de 2 px en el canto
  // derecho, el que da al interior (el mockup la pone en el muro izquierdo:
  // `left: 0; width: 30px; border-right: 5px solid #FFD166`). Dos tiles
  // apilados forman la hoja alta del mockup.
  (cv, x0) => {
    fillRect(cv, x0, 0, 32, 32, col('naranja'));
    fillRect(cv, x0 + 30, 0, 2, 32, col('oro'));
    fillRect(cv, x0 + 22, 14, 4, 4, col('oro'));
  },
  // 9 · LÁMPARA: círculo ORO centrado en (16,15). El mockup la dibuja mucho
  // más gorda que la muestra de la sección 03: r10 es el punto medio. Sin
  // glow horneado (lo pone OfficeScene).
  (cv, x0) => fillCircle(cv, x0 + 16, 15, 10, col('oro')),
  // 10 · PANTALLA MEET: TURQUESA a todo el ancho (y=4, alto 17) + base MORADO
  // (y=23, alto 4). La muestra de la guía la deja con 3 px de aire a los
  // lados, pero el mockup la dibuja de 208 px a 2x (= 1,6 celdas): a todo el
  // ancho, dos tiles contiguos forman el panel de 64 px sin costura.
  (cv, x0) => {
    fillRect(cv, x0, 4, 32, 17, col('turquesa'));
    fillRect(cv, x0, 23, 32, 4, col('morado'));
  },
  // 11 · PLANTA: follaje LIMA 18x13 en (7,9) sobre maceta NARANJA 10x7 en (11,22).
  (cv, x0) => {
    fillRect(cv, x0 + 7, 9, 18, 13, col('lima'));
    fillRect(cv, x0 + 11, 22, 10, 7, col('naranja'));
  },
];

// ---------- sprites/glow.png : halo radial de 64x64 para los glows ----------
//
// La guía pinta los glows con `box-shadow` (caída suave). Una elipse plana de
// Phaser en modo aditivo se ve como un disco duro, así que se genera una
// textura blanca con alfa en caída cuadrática y OfficeScene la tinta del color
// del objeto. No va horneada en ningún tile: es una capa aparte.

function genGlow() {
  const R = 32;
  const cv = makeCanvas(R * 2, R * 2);
  for (let y = 0; y < R * 2; y++) {
    for (let x = 0; x < R * 2; x++) {
      const dx = (x - R + 0.5) / R;
      const dy = (y - R + 0.5) / R;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= 1) continue;
      const a = (1 - d) * (1 - d);
      setPixel(cv, x, y, 255, 255, 255, Math.round(a * 255));
    }
  }
  writePNG('sprites/glow.png', cv);
}

/** Extruye 1 px el borde de cada tile (margin 1, spacing 2 en Tiled).
 * Sin esto, el juego escala el mapa a un factor no entero (FIT: 640x416 en la
 * ventana) y el muestreo del borde de cada tile chupa el píxel del tile
 * vecino de la tira, pintando una rejilla de líneas del color del muro sobre
 * todo el piso. */
function extrude(src, tile, count) {
  const cell = tile + 2;
  const cv = makeCanvas(count * cell, cell);
  const clamp = (v) => Math.min(tile - 1, Math.max(0, v));
  for (let i = 0; i < count; i++) {
    for (let y = -1; y <= tile; y++) {
      for (let x = -1; x <= tile; x++) {
        const si = (clamp(y) * src.w + i * tile + clamp(x)) * 4;
        setPixel(
          cv,
          i * cell + 1 + x,
          1 + y,
          src.data[si],
          src.data[si + 1],
          src.data[si + 2],
          src.data[si + 3],
        );
      }
    }
  }
  return cv;
}

function genTiles() {
  const cv = makeCanvas(TILE * TILE_DRAW.length, TILE);
  TILE_DRAW.forEach((draw, i) => draw(cv, i * TILE));
  writePNG('tiles/office.png', extrude(cv, TILE, TILE_DRAW.length));
}

// ---------- sprites/objects.png : 16 frames de 32x32 (512x32) ----------
//
// Los 12 primeros mantienen su orden histórico (lo consumen OfficeScene.ANIMS,
// scenarios/fx.ts `QUESTION_FRAME = 11` y scenarios/*):
//   0 server_on · 1 server_off · 2 pc_on · 3 pc_off · 4 coffee_a · 5 coffee_b
//   6 lamp_a · 7 lamp_b · 8 meet_on · 9 meet_off · 10 console · 11 question
// y se añaden al final (los índices viejos no se mueven):
//   12 desk · 13 monitor_frame · 14 rack_cap_on · 15 rack_cap_off
//
// - `desk` es sprite, no tile, porque tiene que dibujarse POR ENCIMA de las
//   piernas del personaje sentado detrás (profundidad por Y, ver OfficeScene).
// - `monitor_frame` es sólo el marco, en `#d8d8d8`, para que OfficeScene lo
//   tinte por escritorio (el mockup varía el color del bisel de puesto a
//   puesto). Por eso `pc_on`/`pc_off` ya no llevan borde: son sólo el
//   interior de la pantalla + la peana, y el marco va superpuesto sin teñir
//   el `#3A1959` del interior.
// - `server_on`/`server_off` son ahora el segmento CENTRAL del rack (2 filas
//   de LEDs, sin tapas) y `rack_cap_*` el segmento de los extremos (1 fila +
//   tapa); el de abajo se dibuja con `setFlipY`.
//
// Fondo transparente: son sprites que se superponen al mapa.

// "?" de 5x7 px (la guía pide un signo real, no un cuadrado), pintado a 2x
// para que se lea sobre una celda de 32 px.
const QUESTION_GLYPH = [
  '.###.',
  '#...#',
  '....#',
  '...#.',
  '..#..',
  '.....',
  '..#..',
];

function drawQuestion(cv, x0, color) {
  QUESTION_GLYPH.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '#') fillRect(cv, x0 + 11 + x * 2, 9 + y * 2, 2, 2, color);
    });
  });
}

function drawCoffeeMachine(cv, x0, lit) {
  fillRect(cv, x0, 0, 32, 32, col('surface'));
  strokeRect(cv, x0, 0, 32, 32, 2, col('texto2'));
  fillRect(cv, x0 + 7, 5, 18, 5, col('rosa'));
  const cup = lit ? col('oro') : over(col('oro'), col('surface'), 0.55);
  fillRect(cv, x0 + 10, 16, 12, 9, cup);
}

/** Interior de la pantalla + peana. El marco va en su propio frame
 * (`monitor_frame`) para poder tintarlo por escritorio sin ensuciar el
 * `#3A1959` del interior, que el tinte multiplicativo dejaría casi negro. */
function drawMonitor(cv, x0, on) {
  fillRect(cv, x0 + 5, 7, 22, 15, on ? col('screenOff') : col('screenDead'));
  fillRect(cv, x0 + 12, 22, 8, 4, col('line'));
}

function genObjects() {
  const frames = [
    // 0/1 · segmento CENTRAL del rack (2 filas de LEDs, sin tapas)
    (cv, x0) => drawRackSegment(cv, x0, { live: true, cap: false, rows: [4, 18] }),
    (cv, x0) => drawRackSegment(cv, x0, { live: false, cap: false, rows: [4, 18] }),
    (cv, x0) => drawMonitor(cv, x0, true), // 2 pc_on
    (cv, x0) => drawMonitor(cv, x0, false), // 3 pc_off
    (cv, x0) => drawCoffeeMachine(cv, x0, true), // 4 coffee_a
    (cv, x0) => drawCoffeeMachine(cv, x0, false), // 5 coffee_b
    (cv, x0) => fillCircle(cv, x0 + 16, 15, 10, col('oro')), // 6 lamp_a
    (cv, x0) =>
      fillCircle(cv, x0 + 16, 15, 10, over(col('oro'), col('base'), 0.78)), // 7 lamp_b
    (cv, x0) => {
      // 8 meet_on -- a todo el ancho: dos sprites contiguos forman el panel
      // de 64 px del mockup sin costura.
      fillRect(cv, x0, 4, 32, 17, col('turquesa'));
      fillRect(cv, x0, 23, 32, 4, col('morado'));
    },
    (cv, x0) => {
      // 9 meet_off
      fillRect(cv, x0, 4, 32, 17, col('screenDead'));
      fillRect(cv, x0, 23, 32, 4, col('morado'));
    },
    (cv, x0) => {
      // 10 console: caja ROSA con borde `texto` (el trato de la guía para la
      // acción principal) + pantallita y dos botones.
      fillRect(cv, x0 + 3, 6, 26, 22, col('rosa'));
      strokeRect(cv, x0 + 3, 6, 26, 22, 2, col('texto'));
      fillRect(cv, x0 + 8, 11, 16, 8, col('screenDead'));
      fillRect(cv, x0 + 10, 22, 4, 3, col('oro'));
      fillRect(cv, x0 + 18, 22, 4, 3, col('turquesa'));
    },
    (cv, x0) => drawQuestion(cv, x0, col('oro')), // 11 question
    // 12 · ESCRITORIO (misma receta que el tile 2, pero como sprite para poder
    // ordenarlo por profundidad delante de las piernas del que está sentado).
    (cv, x0) => {
      fillRect(cv, x0, 10, 32, 22, col('deskBody'));
      fillRect(cv, x0, 10, 32, 3, col('deskTop'));
    },
    // 13 · MARCO DEL MONITOR: sólo el bisel de 2 px, en gris tintable.
    (cv, x0) => strokeRect(cv, x0 + 5, 7, 22, 15, 2, col('tintable')),
    // 14/15 · segmento EXTREMO del rack (1 fila de LEDs + tapa arriba).
    (cv, x0) => drawRackSegment(cv, x0, { live: true, cap: true, rows: [12] }),
    (cv, x0) => drawRackSegment(cv, x0, { live: false, cap: true, rows: [12] }),
  ];

  const cv = makeCanvas(TILE * frames.length, TILE);
  frames.forEach((draw, i) => draw(cv, i * TILE));
  writePNG('sprites/objects.png', cv);
}

// ---------- capas de personaje: 3 col x 4 filas de 32x52 (96x208) ----------
//
// Filas: 0 frente · 1 izquierda · 2 derecha · 3 espalda.
// Columnas: 1 = reposo; 0 y 2 = pasos alternos (una pierna 2 px más corta y,
// en la columna 2, el cuerpo 1 px más abajo — los dos cuadros de caminata de
// la guía, sección 04 · POSES MÍNIMAS).
//
// Rectángulos de la guía (32x52): pelo 22x9 en (5,0) · cara 20x14 en (6,9) ·
// torso 28x18 en (2,23) · piernas 8x11 en (4,41) y (20,41).
// Espalda: pelo 22x13 en (5,0) · nuca 16x10 en (8,13).

const CW = 32;
const CH = 52;
const CROWS = 4; // frente, izquierda, derecha, espalda
const CCOLS = 3;

// Piernas por columna: [x, y, w, h] de la pierna izquierda y la derecha.
const LEGS_FRONT = [
  [
    [2, 41, 8, 11],
    [20, 41, 8, 9],
  ], // col 0 · paso A
  [
    [4, 41, 8, 11],
    [20, 41, 8, 11],
  ], // col 1 · reposo
  [
    [4, 41, 8, 9],
    [22, 41, 8, 11],
  ], // col 2 · paso B
];
const LEGS_SIDE = [
  [
    [8, 41, 8, 11],
    [18, 41, 8, 9],
  ],
  [
    [10, 41, 8, 11],
    [16, 41, 8, 11],
  ],
  [
    [10, 41, 8, 9],
    [16, 41, 8, 11],
  ],
];
// Rebote del torso/cabeza: la columna 2 va 1 px más abajo (cuadro B).
const BOB = [0, 0, 1];

function makeCharSheet() {
  return makeCanvas(CW * CCOLS, CH * CROWS);
}

function frameOrigin(row, c) {
  return [c * CW, row * CH];
}

function drawBody(cv, row, c, skin, shade) {
  const [x0, y0] = frameOrigin(row, c);
  const dy = BOB[c];
  if (row === 3) {
    fillRect(cv, x0 + 8, y0 + 13 + dy, 16, 10, shade); // nuca (espalda)
  } else if (row === 0) {
    fillRect(cv, x0 + 6, y0 + 9 + dy, 20, 14, skin); // cara de frente
  } else {
    fillRect(cv, x0 + 8, y0 + 9 + dy, 16, 14, skin); // cara de perfil
    fillRect(cv, x0 + 22, y0 + 9 + dy, 2, 14, shade); // canto sombreado
  }
  const legs = row === 1 || row === 2 ? LEGS_SIDE[c] : LEGS_FRONT[c];
  for (const [lx, ly, lw, lh] of legs) {
    fillRect(cv, x0 + lx, y0 + ly, lw, lh, col('legs'));
  }
}

function drawClothes(cv, row, c, suit) {
  const [x0, y0] = frameOrigin(row, c);
  const dy = BOB[c];
  const [tx, tw] = row === 1 || row === 2 ? [3, 26] : [2, 28];
  fillRect(cv, x0 + tx, y0 + 23 + dy, tw, 18, col('tintable'));
  if (!suit) return;
  // Traje: cuello en V que converge en el centro + línea central VOID desde
  // donde acaba la V hacia abajo. Distingue traje de camisa sin gastar un
  // color de la paleta.
  const top = y0 + 23 + dy;
  for (let i = 0; i < 6; i++) {
    fillRect(cv, x0 + 11 + i, top + i, 2, 1, col('void'));
    fillRect(cv, x0 + 19 - i, top + i, 2, 1, col('void'));
  }
  fillRect(cv, x0 + 15, top + 6, 2, 12, col('void'));
}

function drawHair(cv, row, c, long) {
  const [x0, y0] = frameOrigin(row, c);
  const dy = BOB[c];
  const cap = row === 3 ? 13 : 9; // de espalda el pelo cubre toda la coronilla
  fillRect(cv, x0 + 5, y0 + dy, 22, cap, col('tintable'));
  if (!long) return;
  fillRect(cv, x0 + 3, y0 + dy, 2, 16, col('tintable'));
  fillRect(cv, x0 + 27, y0 + dy, 2, 16, col('tintable'));
}

function genCharLayer(name, drawFn) {
  const cv = makeCharSheet();
  for (let row = 0; row < CROWS; row++) {
    for (let c = 0; c < CCOLS; c++) drawFn(cv, row, c);
  }
  writePNG(`sprites/${name}.png`, cv);
}

function genCharacters() {
  genCharLayer('char_body_light', (cv, r, c) =>
    drawBody(cv, r, c, col('skinLight'), col('skinLightShade')),
  );
  genCharLayer('char_body_dark', (cv, r, c) =>
    drawBody(cv, r, c, col('skinDark'), col('skinDarkShade')),
  );
  genCharLayer('char_hair_short', (cv, r, c) => drawHair(cv, r, c, false));
  genCharLayer('char_hair_long', (cv, r, c) => drawHair(cv, r, c, true));
  genCharLayer('char_clothes_shirt', (cv, r, c) => drawClothes(cv, r, c, false));
  genCharLayer('char_clothes_suit', (cv, r, c) => drawClothes(cv, r, c, true));
}

// ---------- ATTRIBUTION.md ----------
// Nota: no hay un genAudioReadme() aqui a proposito -- public/assets/audio/
// README.md esta mantenido a mano (el audio real vive sintetizado en
// src/audio.ts, no como placeholder generado) y este script no debe pisarlo.

function genAttribution() {
  const full = join(ASSETS, 'ATTRIBUTION.md');
  const content = `# Attribution

Todo el arte de esta carpeta es **pixel art generado por script**
(\`frontend/scripts/gen-assets.mjs\`), dibujado rectángulo a rectángulo según
la guía de arte "Synth Dusk" de Claude Design
(\`docs/design/guia-visual.dc.html\`, secciones 03 TILES y 04 SPRITE SHEET).
Las coordenadas de la guía se muestran a 2x en cajas de 64 px: aquí van
divididas por 2.

No se usa arte de terceros, así que no se debe atribución externa.

## Archivos y geometría de frames

### \`tiles/office.png\` — 408x34, 12 tiles de 32x32 (margin 1, spacing 2)

\`0 piso · 1 muro · 2 escritorio · 3 silla · 4 monitor_on · 5 monitor_off ·
6 rack GitHub · 7 cafetera · 8 puerta · 9 lámpara · 10 pantalla Meet · 11 planta\`

Los tiles de mobiliario tienen fondo transparente: se pintan en la capa
\`furniture\` sobre la capa \`floor\`.

### \`sprites/glow.png\` — 64x64, halo radial blanco

Textura de un solo uso: \`OfficeScene\` la tinta y la escala para los glows
aditivos (monitores encendidos, rack, lámparas, pantalla Meet).

### \`sprites/objects.png\` — 512x32, 16 frames de 32x32 en fila

\`server_on, server_off, pc_on, pc_off, coffee_a, coffee_b, lamp_a, lamp_b,
meet_on, meet_off, console, question, desk, monitor_frame, rack_cap_on,
rack_cap_off\`. Fondo transparente. Los 12 primeros índices no se mueven
nunca (\`scenarios/fx.ts\` referencia el 11 y \`OfficeScene\` el 10).

\`desk\` es sprite y no tile porque tiene que dibujarse por encima de las
piernas de quien está sentado detrás. \`monitor_frame\` es el bisel en
\`#d8d8d8\`, que \`OfficeScene\` tinta por escritorio; por eso \`pc_on\`/\`pc_off\`
sólo llevan el interior de la pantalla y la peana. \`server_on\`/\`server_off\`
son el segmento central de la torre del rack y \`rack_cap_*\` los extremos.

### Capas de personaje — 96x208 (3 columnas x 4 filas de 32x52)

Filas: frente, izquierda, derecha, espalda. Columnas: 1 = reposo, 0 y 2 =
pasos alternos.

- \`sprites/char_body_light.png\`, \`sprites/char_body_dark.png\`
- \`sprites/char_hair_short.png\`, \`sprites/char_hair_long.png\`
- \`sprites/char_clothes_shirt.png\`, \`sprites/char_clothes_suit.png\`

Pelo y ropa se dibujan en \`#d8d8d8\` para que el tinte en runtime
(\`HAIR_PALETTE\` / \`PALETTE\`) lea vivo. La piel va en \`#E8B98A\` (clara) o
\`#8A5C3E\` (oscura) y el pantalón siempre en \`#331D53\`.

Los glows (\`box-shadow\` en la guía) **no** están horneados en los PNG: los
añade \`OfficeScene\` como elipses aditivas detrás de monitores encendidos,
rack, lámparas y pantalla Meet.

### \`audio/\`

Ver \`audio/README.md\` — 4 archivos a soltar más adelante (\`music.ogg\`,
\`door.ogg\`, \`alarm.ogg\`, \`click.ogg\`).
`;
  writeFileSync(full, content);
  console.log('wrote ATTRIBUTION.md');
}

// ---------- run ----------

genTiles();
genGlow();
genObjects();
genCharacters();
genAttribution();
