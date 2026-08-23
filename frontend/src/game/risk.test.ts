import { describe, it, expect } from 'vitest';
import { riskLevel } from './risk';

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
