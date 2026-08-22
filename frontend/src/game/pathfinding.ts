import Phaser from 'phaser';
import * as EasyStar from 'easystarjs';

const COLLISION_LAYER = 'collision';

export interface Pathfinder {
  /** Coordenadas en tiles (no píxeles). Nunca rechaza; sin camino -> []. */
  findPath(
    from: { x: number; y: number },
    to: { x: number; y: number },
  ): Promise<{ x: number; y: number }[]>;
}

/** Construye un pathfinder easystar a partir de la capa `collision` del tilemap. */
export function createPathfinder(map: Phaser.Tilemaps.Tilemap): Pathfinder {
  const easystar = new EasyStar.js();

  const grid: number[][] = [];
  for (let y = 0; y < map.height; y++) {
    const row: number[] = [];
    for (let x = 0; x < map.width; x++) {
      const tile = map.getTileAt(x, y, false, COLLISION_LAYER);
      row.push(!tile || tile.index <= 0 ? 0 : 1);
    }
    grid.push(row);
  }

  easystar.setGrid(grid);
  easystar.setAcceptableTiles([0]);
  easystar.disableDiagonals(); // 4 direcciones para giros de sprite limpios

  return {
    findPath(from, to) {
      return new Promise((resolve) => {
        easystar.findPath(from.x, from.y, to.x, to.y, (path) => {
          resolve(path ?? []);
        });
        easystar.calculate();
      });
    },
  };
}
