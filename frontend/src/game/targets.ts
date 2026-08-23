// Resolución de "punto del mapa -> celda a la que hay que caminar". Pura (sin
// Phaser) a propósito: `Character` la usa en runtime y `map.test.ts` la usa
// para comprobar, sobre el office.json real, que todos los destinos son
// alcanzables. Si esta regla y el mapa se separan, el test lo canta.
import { TILE } from './palette';

/** ¿La celda (en tiles) está bloqueada por la capa `collision`? */
export type IsBlocked = (x: number, y: number) => boolean;

export interface Tile {
  x: number;
  y: number;
}

/**
 * Celda destino para un punto del mapa. `point` viene en píxeles (esquina
 * superior izquierda del tile, que es como Tiled guarda los objetos).
 *
 * - `desk_i`: la silla, que es el tile de ARRIBA-DERECHA del escritorio (el
 *   monitor ocupa el de arriba-izquierda y la mesa la fila de abajo, ver
 *   scripts/gen-map.mjs). Nunca está bloqueada.
 * - Cualquier otro punto: su propio tile, o el de abajo si el punto cae sobre
 *   un mueble sólido (cafetera, rack, consola...).
 */
export function resolveTargetTile(
  name: string,
  point: Tile,
  blocked: IsBlocked,
): Tile {
  const tile = { x: point.x / TILE, y: point.y / TILE };
  if (name.startsWith('desk_')) return { x: tile.x + 1, y: tile.y - 1 };
  return blocked(tile.x, tile.y) ? { x: tile.x, y: tile.y + 1 } : tile;
}
