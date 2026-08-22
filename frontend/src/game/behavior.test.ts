import { describe, it, expect } from 'vitest';
import { nextState, durationMs, pointFor } from './behavior';

describe('nextState', () => {
  it('trabajando aparece entre 0.67 y 0.73 de las veces en 10000 muestras', () => {
    let count = 0;
    for (let i = 0; i < 10000; i++) {
      if (nextState() === 'trabajando') count++;
    }
    const freq = count / 10000;
    expect(freq).toBeGreaterThan(0.67);
    expect(freq).toBeLessThan(0.73);
  });

  it('nextState(0.99) es caminar', () => {
    expect(nextState(0.99)).toBe('caminar');
  });

  it('nextState(0) es trabajando', () => {
    expect(nextState(0)).toBe('trabajando');
  });
});

describe('durationMs', () => {
  it('está siempre entre 4000 y 12000ms', () => {
    expect(durationMs('trabajando', 0)).toBe(4000);
    expect(durationMs('trabajando', 1)).toBe(12000);
    expect(durationMs('trabajando', 0.5)).toBe(8000);
  });
});

describe('pointFor', () => {
  it('trabajando apunta al escritorio propio', () => {
    expect(pointFor('trabajando', 3)).toBe('desk_3');
    expect(pointFor('trabajando', 0)).toBe('desk_0');
  });

  it('cafe apunta a coffee', () => {
    expect(pointFor('cafe', 5)).toBe('coffee');
  });

  it('reunion apunta a meeting', () => {
    expect(pointFor('reunion', 5)).toBe('meeting');
  });

  it('caminar elige entre coffee/meeting/door según rng', () => {
    expect(pointFor('caminar', 0, () => 0)).toBe('coffee');
    expect(pointFor('caminar', 0, () => 0.34)).toBe('meeting');
    expect(pointFor('caminar', 0, () => 0.99)).toBe('door');
  });
});
