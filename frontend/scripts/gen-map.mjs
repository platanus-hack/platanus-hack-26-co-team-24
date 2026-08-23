// Genera public/assets/maps/office.json, un tilemap Tiled 1.10 en JSON, por
// script (no hay GUI de Tiled). Layout: 20x13 tiles de 32 px = 640x416, el
// tamaño exacto del canvas del juego (game/config.ts), sin zoom ni paneo de
// cámara: toda la oficina cabe en pantalla.
//
// La composición reproduce el mockup de la guía (docs/design/oficina-mockup.html,
// sección 05 de guia-visual.dc.html): muro superior de 2 filas con lámparas,
// cafetera arriba-izquierda, 3x3 de escritorios (monitor arriba, silla abajo),
// sala Meet arriba-derecha tras un muro parcial con abertura de 2 tiles, rack
// de GitHub en la pared derecha fuera de la sala, puerta abajo-centro, consola
// abajo-derecha y dos plantas.
//
// Tileset `office` (public/assets/tiles/office.png, 12 tiles de 32 px, firstgid=1):
//   0 piso(gid1)  1 muro(gid2)  2 escritorio(gid3)  3 silla(gid4)
//   4 monitor_on(gid5)  5 monitor_off(gid6)  6 rack(gid7)  7 cafetera(gid8)
//   8 puerta(gid9)  9 lámpara(gid10)  10 pantalla_meet(gid11)  11 planta(gid12)
//
// Capas: floor, walls, furniture, collision (tile layers) + points (objetos).
// La capa `collision` marca celda bloqueada con el gid del muro; 0 = libre.
// `pathfinding.ts` la lee tal cual: índice > 0 = bloqueada.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'assets', 'maps', 'office.json');

const TILE = 32;
const W = 20;
const H = 13;

const GID = {
  floor: 1,
  wall: 2,
  desk: 3,
  chair: 4,
  monitorOn: 5,
  monitorOff: 6,
  rack: 7,
  coffee: 8,
  door: 9,
  lamp: 10,
  meetScreen: 11,
  plant: 12,
};

function grid(fill) {
  return Array.from({ length: H }, () => Array.from({ length: W }, () => fill));
}

const floor = grid(GID.floor);
const walls = grid(0);
const furniture = grid(0);
const collision = grid(0);

function setWall(x, y) {
  walls[y][x] = GID.wall;
  collision[y][x] = GID.wall;
}

/** Mueble sólido: se pinta en `furniture` y bloquea el paso. */
function setProp(x, y, gid) {
  furniture[y][x] = gid;
  collision[y][x] = GID.wall;
}

/** Mueble por el que sí se camina (sillas, y la puerta en el muro). */
function setWalkable(x, y, gid, layer = furniture) {
  layer[y][x] = gid;
  collision[y][x] = 0;
}

// ---------- muros: perímetro, con el muro superior de 2 filas ----------
// El mockup pinta una franja de muro de ~120 px (a 2x) en la parte alta: son
// 2 filas de 32 px. Ahí cuelgan las lámparas y la pantalla de la sala Meet.
for (let x = 0; x < W; x++) {
  setWall(x, 0);
  setWall(x, 1);
  setWall(x, H - 1);
}
for (let y = 0; y < H; y++) {
  setWall(0, y);
  setWall(W - 1, y);
}

// ---------- puerta: muro izquierdo, a media altura, atravesable ----------
// El mockup la dibuja como una hoja naranja vertical pegada al muro de la
// izquierda (`left: 0; top: 420px; height: 150px`), no como un hueco abajo.
const DOOR = { x: 0, y: 6 };
setWalkable(DOOR.x, DOOR.y, GID.door, walls);
setWalkable(DOOR.x, DOOR.y + 1, GID.door, walls);

// ---------- sala Meet: arriba-derecha, muro parcial con abertura de 2 ----------
// Interior x 15..18, y 2..4. Muro vertical en x=14 (y 2..5) y muro inferior en
// y=5 sólo en x 17..18: la abertura de 2 tiles es (15,5) y (16,5).
const MEET = { x0: 15, x1: 18, y0: 2, y1: 4 };
for (let y = MEET.y0; y <= MEET.y1 + 1; y++) setWall(14, y);
setWall(17, MEET.y1 + 1);
setWall(18, MEET.y1 + 1);

// Mesa de juntas 3x1 (el mockup la dibuja igual que un escritorio: cuerpo
// #6E4FA8 con canto LILA) y pantalla Meet de 2 tiles colgada del muro
// superior, como el panel de 208 px del mockup.
for (const x of [15, 16, 17]) setProp(x, 3, GID.desk);
const MEET_SCREEN = { x: 16, y: 1 }; // el sprite hermano va en (17,1)
for (const x of [16, 17]) furniture[1][x] = GID.meetScreen; // ya son muro
const MEETING = { x: 16, y: 4 }; // celda libre delante de la mesa

// ---------- escritorios: 3x3, mesa de 2 tiles, silla ENCIMA ----------
// Cada puesto ocupa 2 filas: la silla va en la fila de ARRIBA (y-1) y la mesa
// en la de abajo, de modo que la persona queda detrás del escritorio y de cara
// al espectador, como en el mockup. El tablero se dibuja como sprite (frame
// `desk` de objects.png) con profundidad por Y, así tapa las piernas del que
// está sentado. El monitor tampoco es un tile: es el sprite `pc`, apoyado en
// el canto de la mesa (offset -12 px) sobre el tile IZQUIERDO; la silla va en
// el DERECHO para que la persona quede al lado del monitor y no detrás.
const DESK_COLS = [2, 7, 11];
const DESK_ROWS = [3, 6, 9];
const desks = [];
for (const y of DESK_ROWS) {
  for (const x of DESK_COLS) {
    desks.push({ x, y });
    // La mesa bloquea pero no se pinta en `furniture`: la dibuja OfficeScene.
    collision[y][x] = GID.wall;
    collision[y][x + 1] = GID.wall;
    collision[y - 1][x] = GID.wall; // el monitor asoma aquí: nadie lo atraviesa
    setWalkable(x + 1, y - 1, GID.chair); // la silla es el destino de `desk_i`
  }
}

// ---------- cafetera + planta arriba-izquierda ----------
const COFFEE = { x: 1, y: 2 };
setProp(COFFEE.x, COFFEE.y, GID.coffee);
setProp(5, 2, GID.plant);

// ---------- planta abajo-izquierda ----------
setProp(1, 11, GID.plant);

// ---------- rack GitHub: pared derecha, fuera de la sala Meet ----------
// Torre de 3 tiles como en el mockup (118x214 a 2x). El punto `server` es el
// segmento de abajo; (18,9) queda libre, así que el destino es alcanzable.
// Los tiles sólo bloquean: los tres segmentos los pinta OfficeScene con los
// frames `rack_cap_*` / `server_*` de objects.png.
const SERVER = { x: 18, y: 8 };
for (const y of [6, 7, 8]) collision[y][SERVER.x] = GID.wall;

// ---------- consola arcade: abajo-derecha ----------
const CONSOLE = { x: 17, y: 11 };
collision[CONSOLE.y][CONSOLE.x] = GID.wall; // sprite-only (objects.png frame 10)

// ---------- lámparas del techo: sprite-only sobre el muro superior ----------
const LAMPS = [
  { x: 4, y: 0 },
  { x: 10, y: 0 },
  { x: 16, y: 0 },
];
for (const l of LAMPS) furniture[l.y][l.x] = GID.lamp;

// ---------- capa de objetos `points` ----------
const points = [];
let nextId = 1;

function addPoint(name, tile) {
  points.push({
    id: nextId++,
    name,
    type: '',
    x: tile.x * TILE,
    y: tile.y * TILE,
    width: TILE,
    height: TILE,
    rotation: 0,
    visible: true,
    properties: [],
  });
}

desks.forEach((d, i) => addPoint(`desk_${i}`, d));
addPoint('coffee', COFFEE);
addPoint('meeting', MEETING);
addPoint('door', DOOR);
addPoint('server', SERVER);
addPoint('console', CONSOLE);
addPoint('meet_screen', MEET_SCREEN);
addPoint('cto_pc', desks[0]); // cto_pc vive sobre desk_0

// ---------- sanity check: todo destino de caminata debe ser alcanzable ----------
// `Character.resolveTargetTile` usa el tile del punto y, si está bloqueado,
// el de abajo. Si ambos estuvieran bloqueados el personaje se quedaría
// clavado en el spawn, así que fallamos aquí y no en el navegador.
const blocked = (x, y) =>
  x < 0 || y < 0 || x >= W || y >= H || collision[y][x] !== 0;
for (const name of [
  ...desks.map((_, i) => `desk_${i}`),
  'coffee',
  'meeting',
  'door',
  'server',
]) {
  const p = points.find((o) => o.name === name);
  const t = { x: p.x / TILE, y: p.y / TILE };
  const target = name.startsWith('desk_')
    ? { x: t.x + 1, y: t.y - 1 }
    : blocked(t.x, t.y)
      ? { x: t.x, y: t.y + 1 }
      : t;
  if (blocked(target.x, target.y)) {
    throw new Error(
      `punto "${name}" resuelve a (${target.x},${target.y}), que está bloqueado`,
    );
  }
}

// ---------- ensamblar el JSON de Tiled ----------

function tileLayer(id, name, data) {
  return {
    id,
    name,
    type: 'tilelayer',
    x: 0,
    y: 0,
    width: W,
    height: H,
    visible: true,
    opacity: 1,
    data: data.flat(),
  };
}

const map = {
  compressionlevel: -1,
  width: W,
  height: H,
  tilewidth: TILE,
  tileheight: TILE,
  infinite: false,
  orientation: 'orthogonal',
  renderorder: 'right-down',
  type: 'map',
  version: '1.10',
  tiledversion: '1.10.2',
  nextlayerid: 6,
  nextobjectid: nextId,
  tilesets: [
    {
      firstgid: 1,
      name: 'office',
      image: '../tiles/office.png',
      // El tileset va extruido 1 px por tile (ver gen-assets.mjs `extrude`):
      // 12 celdas de 34 px con margen 1 y separación 2.
      imagewidth: 408,
      imageheight: 34,
      tilewidth: TILE,
      tileheight: TILE,
      tilecount: 12,
      columns: 12,
      margin: 1,
      spacing: 2,
    },
  ],
  layers: [
    tileLayer(1, 'floor', floor),
    tileLayer(2, 'walls', walls),
    tileLayer(3, 'furniture', furniture),
    { ...tileLayer(4, 'collision', collision), visible: false },
    {
      id: 5,
      name: 'points',
      type: 'objectgroup',
      draworder: 'topdown',
      x: 0,
      y: 0,
      visible: true,
      opacity: 1,
      objects: points,
    },
  ],
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(map, null, 2));
console.log('wrote', OUT, `${W}x${H} @${TILE}px`);
