import { describe, it, expect, vi } from 'vitest';

// `fx.ts` importa Phaser en runtime y Phaser toca `window` al cargarse: aquí
// sólo verificamos el mapeo id -> runner, así que lo stubeamos.
vi.mock('phaser', () => ({ default: {} }));

import { SCENARIOS, getRunner } from './index';
import escenarios from '../../mocks/escenarios.json';

const IDS = escenarios.scenarios.map((s) => s.id);

describe('SCENARIOS', () => {
  it('cada runner registrado corresponde a un escenario del catálogo', () => {
    for (const id of Object.keys(SCENARIOS)) {
      expect(IDS).toContain(id);
    }
  });

  it('el catálogo incluye los escenarios con animación propia', () => {
    expect(IDS).toEqual(
      expect.arrayContaining(['renuncia', 'github_caido', 'robo_pc']),
    );
  });
});

describe('getRunner', () => {
  it('devuelve una función para todos los ids del catálogo (fallback genérico incluido)', () => {
    for (const id of IDS) {
      expect(typeof getRunner(id)).toBe('function');
    }
  });
});
