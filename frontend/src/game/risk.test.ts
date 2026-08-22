import { describe, it, expect } from 'vitest';
import { scoreToColor, isCritical, riskLevel } from './risk';

describe('scoreToColor', () => {
  it('0 -> lima (riskLow)', () => {
    expect(scoreToColor(0)).toBe(0xb6ff3c);
  });

  it('40 -> lima (riskLow), borde inclusivo', () => {
    expect(scoreToColor(40)).toBe(0xb6ff3c);
  });

  it('41 -> oro (riskMid)', () => {
    expect(scoreToColor(41)).toBe(0xffd166);
  });

  it('70 -> oro (riskMid), borde inclusivo', () => {
    expect(scoreToColor(70)).toBe(0xffd166);
  });

  it('71 -> rojo (riskHigh)', () => {
    expect(scoreToColor(71)).toBe(0xff2e63);
  });

  it('100 -> rojo (riskHigh)', () => {
    expect(scoreToColor(100)).toBe(0xff2e63);
  });
});

describe('isCritical', () => {
  it('70 no es crítico', () => {
    expect(isCritical(70)).toBe(false);
  });

  it('71 es crítico', () => {
    expect(isCritical(71)).toBe(true);
  });
});

describe('riskLevel', () => {
  it('0 -> bajo', () => {
    expect(riskLevel(0)).toBe('bajo');
  });

  it('39 -> bajo, borde inclusivo', () => {
    expect(riskLevel(39)).toBe('bajo');
  });

  it('40 -> medio, borde inclusivo', () => {
    expect(riskLevel(40)).toBe('medio');
  });

  it('69 -> medio, borde inclusivo', () => {
    expect(riskLevel(69)).toBe('medio');
  });

  it('70 -> alto, borde inclusivo', () => {
    expect(riskLevel(70)).toBe('alto');
  });

  it('100 -> alto', () => {
    expect(riskLevel(100)).toBe('alto');
  });
});
