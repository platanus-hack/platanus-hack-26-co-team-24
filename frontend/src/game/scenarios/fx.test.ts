import { describe, it, expect, vi } from 'vitest';

// `fx.ts` importa Phaser en runtime y Phaser toca `window` al cargarse: como
// `index.test.ts`, sólo probamos la función pura, así que lo stubeamos.
vi.mock('phaser', () => ({ default: {} }));

import { dashedRectSegments } from './fx';

describe('dashedRectSegments', () => {
  it('traza 5 trazos por lado (20 en total) para un hueco de 32x32 con dash 4 / gap 3', () => {
    // guía, sección 06 · ROBO DEL PC: "hueco punteado... 4 px dash, 3 px gap
    // por lado". Periodo 7 px sobre un lado de 32 px -> 5 trazos completos
    // (0,7,14,21,28) por lado, x4 lados.
    expect(dashedRectSegments(32, 32, 4, 3)).toHaveLength(20);
  });
});
