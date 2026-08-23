import { describe, it, expect } from 'vitest';
import { formatSeconds } from './format';

describe('formatSeconds', () => {
  it('9400 ms -> "9,4" (1 decimal, coma)', () => {
    expect(formatSeconds(9400)).toBe('9,4');
  });

  it('512 ms -> "0,5"', () => {
    expect(formatSeconds(512)).toBe('0,5');
  });

  it('0 ms -> "0,0"', () => {
    expect(formatSeconds(0)).toBe('0,0');
  });
});
