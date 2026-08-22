import { describe, it, expect } from 'vitest';
import { scoreToColor, isCritical } from './risk';

describe('scoreToColor', () => {
  it('0 -> verde (riskLow)', () => {
    expect(scoreToColor(0)).toBe(0x00ff88);
  });

  it('40 -> verde (riskLow), borde inclusivo', () => {
    expect(scoreToColor(40)).toBe(0x00ff88);
  });

  it('41 -> amarillo (riskMid)', () => {
    expect(scoreToColor(41)).toBe(0xffea00);
  });

  it('70 -> amarillo (riskMid), borde inclusivo', () => {
    expect(scoreToColor(70)).toBe(0xffea00);
  });

  it('71 -> rojo (riskHigh)', () => {
    expect(scoreToColor(71)).toBe(0xff1744);
  });

  it('100 -> rojo (riskHigh)', () => {
    expect(scoreToColor(100)).toBe(0xff1744);
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
