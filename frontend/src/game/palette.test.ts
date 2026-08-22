import { describe, it, expect } from 'vitest';
import { HAIR_PALETTE, PALETTE, PAIRS } from './palette';

describe('PAIRS', () => {
  it('los 9 pares son únicos (pelo+ropa nunca se repite)', () => {
    const keys = new Set(PAIRS.map((p) => p.join('+')));
    expect(keys.size).toBe(9);
  });

  it('cada clave de PAIRS existe en HAIR_PALETTE o PALETTE', () => {
    const validKeys = new Set([...Object.keys(HAIR_PALETTE), ...Object.keys(PALETTE)]);
    for (const pair of PAIRS) {
      for (const key of pair) {
        expect(validKeys.has(key)).toBe(true);
      }
    }
  });
});
