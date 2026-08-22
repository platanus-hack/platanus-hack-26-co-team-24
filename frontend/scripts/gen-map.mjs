// Generates public/assets/maps/office.json, a Tiled 1.10 JSON tilemap, by
// script (no Tiled GUI available). Layout: 40x25 tiles of 16px.
//
// Tileset `office` (public/assets/tiles/office.png, 8 tiles x16px, firstgid=1):
//   0 floor(gid1), 1 wall(gid2), 2 desk(gid3), 3 chair(gid4), 4 coffee(gid5),
//   5 meeting table(gid6), 6 server(gid7), 7 console(gid8).
//
// Layers: floor, walls, furniture, collision (tile layers) + points (object layer).
// collision layer: gid 2 (wall) marks a blocked cell, 0 = free. The pathfinder
// (later task) reads this layer directly: non-zero = blocked.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'assets', 'maps', 'office.json');

const W = 40;
const H = 25;

const GID = {
  floor: 1,
  wall: 2,
  desk: 3,
  chair: 4,
  coffee: 5,
  table: 6,
  server: 7,
  console: 8,
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

function clearWall(x, y) {
  walls[y][x] = 0;
  collision[y][x] = 0;
}

function setFurniture(x, y, gid) {
  furniture[y][x] = gid;
  collision[y][x] = GID.wall; // blocked, regardless of which furniture gid
}

// ---------- perimeter walls ----------
for (let x = 0; x < W; x++) {
  setWall(x, 0);
  setWall(x, H - 1);
}
for (let y = 0; y < H; y++) {
  setWall(0, y);
  setWall(W - 1, y);
}

// ---------- door: opening in the bottom wall, centered ----------
const DOOR = { x: 20, y: H - 1 };
clearWall(DOOR.x, DOOR.y);

// ---------- meeting room separator: vertical wall at x=29, 3-tile opening ----------
const SEPARATOR_X = 29;
const OPENING_Y = [11, 12, 13];
for (let y = 1; y < H - 1; y++) {
  if (!OPENING_Y.includes(y)) setWall(SEPARATOR_X, y);
}

// ---------- desks: 3x3 grid, aisles between, chair directly below each ----------
const DESK_COLS = [5, 12, 19];
const DESK_ROWS = [5, 11, 17];
const desks = [];
for (const r of DESK_ROWS) {
  for (const c of DESK_COLS) {
    desks.push({ x: c, y: r });
  }
}
desks.forEach(({ x, y }) => {
  setFurniture(x, y, GID.desk);
  furniture[y + 1][x] = GID.chair; // chair tile, visual only
  // chair cell stays free (not blocked) in collision
});

// ---------- coffee: top-left ----------
const COFFEE = { x: 2, y: 2 };
setFurniture(COFFEE.x, COFFEE.y, GID.coffee);

// ---------- server: top-right of main office area ----------
const SERVER = { x: 26, y: 2 };
setFurniture(SERVER.x, SERVER.y, GID.server);

// ---------- console: bottom-right of main office area ----------
const CONSOLE = { x: 26, y: 21 };
setFurniture(CONSOLE.x, CONSOLE.y, GID.console);

// ---------- meeting table: 3x3 block inside meeting room ----------
const TABLE_COLS = [33, 34, 35];
const TABLE_ROWS = [10, 11, 12];
for (const y of TABLE_ROWS) {
  for (const x of TABLE_COLS) {
    setFurniture(x, y, GID.table);
  }
}

// ---------- meeting room extra points (sprite-only, no tile) ----------
const MEET_SCREEN = { x: 34, y: 2 };
const MEETING = { x: 34, y: 6 };

// ---------- points object layer ----------
function tileToPx(t) {
  return { x: t.x * 16, y: t.y * 16 };
}

const points = [];
let nextId = 1;

function addPoint(name, tile) {
  const px = tileToPx(tile);
  points.push({
    id: nextId++,
    name,
    type: '',
    x: px.x,
    y: px.y,
    width: 16,
    height: 16,
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
addPoint('cto_pc', desks[0]); // cto_pc sits on desk_0

// ---------- assemble Tiled JSON ----------

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
  tilewidth: 16,
  tileheight: 16,
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
      imagewidth: 128,
      imageheight: 16,
      tilewidth: 16,
      tileheight: 16,
      tilecount: 8,
      columns: 8,
      margin: 0,
      spacing: 0,
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
console.log('wrote', OUT);
