// Alcanzabilidad del mapa real (`public/assets/maps/office.json`) sin levantar
// Phaser: se lee el JSON de Tiled, se arma la rejilla bloqueada desde la capa
// `collision` y se hace BFS de 4 direcciones desde cada silla.
//
// Existe porque el modo de fallo es silencioso: si un mueble tapa el único
// hueco de una silla o un muro sella la abertura de la sala Meet, el
// pathfinder devuelve [] y el personaje se queda clavado en su sitio para
// siempre, sin error de consola ni test roto. Aquí revienta en CI.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE, MAP_COLS, MAP_ROWS, MAP_W, MAP_H } from './palette';
import { resolveTargetTile, type Tile } from './targets';

interface TileLayer {
  name: string;
  type: string;
  data?: number[];
  objects?: { name: string; x: number; y: number }[];
}
interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TileLayer[];
  tilesets: { tilecount: number }[];
}

const MAP_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'public',
  'assets',
  'maps',
  'office.json',
);

const map: TiledMap = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const layer = (name: string): TileLayer => {
  const found = map.layers.find((l) => l.name === name);
  if (!found) throw new Error(`falta la capa "${name}" en office.json`);
  return found;
};

const collision = layer('collision').data!;
const blocked = (x: number, y: number): boolean =>
  x < 0 ||
  y < 0 ||
  x >= map.width ||
  y >= map.height ||
  collision[y * map.width + x] !== 0;

const points: Record<string, Tile> = Object.fromEntries(
  (layer('points').objects ?? []).map((o) => [o.name, { x: o.x, y: o.y }]),
);

const DESKS = Array.from({ length: 9 }, (_, i) => `desk_${i}`);
// Todo lo que `behavior.ts` (o un runner de escenario) puede pedirle a un
// personaje que camine.
const TARGETS = [...DESKS, 'coffee', 'meeting', 'door', 'server', 'console'];

const key = (t: Tile) => `${t.x},${t.y}`;

/** Celdas alcanzables desde `start` moviéndose en 4 direcciones. */
function flood(start: Tile): Set<string> {
  const seen = new Set<string>([key(start)]);
  const queue: Tile[] = [start];
  while (queue.length) {
    const { x, y } = queue.shift()!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next = { x: x + dx, y: y + dy };
      if (blocked(next.x, next.y) || seen.has(key(next))) continue;
      seen.add(key(next));
      queue.push(next);
    }
  }
  return seen;
}

describe('office.json', () => {
  it('es la grilla que declara palette.ts (16:9, Task H)', () => {
    expect([map.width, map.height]).toEqual([MAP_COLS, MAP_ROWS]);
    expect([map.tilewidth, map.tileheight]).toEqual([TILE, TILE]);
  });

  // `game/config.ts` deriva su tamaño de `MAP_W`/`MAP_H` (importarlo aquí
  // traería Phaser al entorno de test de Node, que no tiene
  // `window`/`document`), así que se comprueban esas constantes contra el
  // tamaño del mapa real: si alguien cambia W/H en gen-map.mjs sin tocar
  // palette.ts (o viceversa), este test lo detecta.
  it('el canvas del juego (MAP_W x MAP_H) mide lo que mide el mapa', () => {
    expect([MAP_W, MAP_H]).toEqual([map.width * TILE, map.height * TILE]);
  });

  it('declara los 14 puntos que consumen la escena y el comportamiento', () => {
    for (const name of TARGETS) expect(points[name]).toBeDefined();
    expect(points['meet_screen']).toBeDefined();
    expect(points['cto_pc']).toBeDefined();
  });

  it('no deja ningún tile del tileset sin usar', () => {
    const used = new Set<number>();
    for (const name of ['floor', 'walls', 'furniture']) {
      for (const gid of layer(name).data ?? []) if (gid > 0) used.add(gid);
    }
    const { tilecount } = map.tilesets[0];
    const dead = Array.from({ length: tilecount }, (_, i) => i + 1).filter(
      (gid) => !used.has(gid),
    );
    expect(dead).toEqual([]);
  });
});

describe('alcanzabilidad', () => {
  const resolved = Object.fromEntries(
    TARGETS.map((name) => [name, resolveTargetTile(name, points[name], blocked)]),
  );

  it.each(TARGETS)('el destino de "%s" es una celda libre', (name) => {
    const t = resolved[name];
    expect(
      blocked(t.x, t.y),
      `"${name}" resuelve a (${t.x},${t.y}), que está bloqueada`,
    ).toBe(false);
  });

  it.each(DESKS)('desde la silla de %s se llega a todo lo demás', (desk) => {
    const reachable = flood(resolved[desk]);
    const unreachable = TARGETS.filter(
      (name) => name !== desk && !reachable.has(key(resolved[name])),
    );
    expect(
      unreachable,
      `desde ${desk} no se llega a: ${unreachable.join(', ')}`,
    ).toEqual([]);
  });
});
