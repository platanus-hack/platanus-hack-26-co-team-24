import { describe, it, expect } from 'vitest';
import { HAIR_PALETTE, PALETTE, PAIRS, TILE, SPRITE_W, SPRITE_H, assignPairs } from './palette';
import oficinaMock from '../mocks/oficina.json';

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

describe('grilla', () => {
  it('TILE es 32 px (guía, sección 03 · TILES 32PX)', () => {
    expect(TILE).toBe(32);
  });

  it('el sprite es 32x52 (guía, sección 04)', () => {
    expect([SPRITE_W, SPRITE_H]).toEqual([32, 52]);
  });
});

describe('assignPairs', () => {
  const pairs = assignPairs(oficinaMock.people);

  it('las 9 personas del mock reciben 9 pares distintos', () => {
    const values = Object.values(pairs);
    expect(values).toHaveLength(9);
    expect(new Set(values.map((p) => p.join('+'))).size).toBe(9);
  });

  it('Ana lleva el par que la guía le pone: pelo turquesa + ropa rosa', () => {
    expect(pairs['p_ana']).toEqual(['blue', 'red']);
  });

  it('David, Samuel y Andrés también salen como en la guía', () => {
    expect(pairs['p_david']).toEqual(['orange', 'green']);
    expect(pairs['p_samuel']).toEqual(['gray', 'blue']);
    expect(pairs['p_andres']).toEqual(['yellow', 'purple']);
  });

  it('con la API real (ids = email) los cuatro pares nombrados se mantienen', () => {
    const reales = assignPairs(
      [
        'ana',
        'david',
        'valentina',
        'jorge',
        'brayan',
        'andres',
        'laura',
        'camilo',
        'samuel',
      ].map((n) => ({ id: `${n}@empresa.com` })),
    );
    expect(reales['ana@empresa.com']).toEqual(['blue', 'red']);
    expect(reales['david@empresa.com']).toEqual(['orange', 'green']);
    expect(reales['samuel@empresa.com']).toEqual(['gray', 'blue']);
    expect(reales['andres@empresa.com']).toEqual(['yellow', 'purple']);
    expect(new Set(Object.values(reales).map((p) => p.join('+'))).size).toBe(9);
  });
});
