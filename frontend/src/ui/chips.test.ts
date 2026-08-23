import { describe, it, expect } from 'vitest';
import { tipoChip, tipoChipColor } from './chips';

describe('tipoChip', () => {
  it('regla_tacita -> TÁCITO', () => {
    expect(tipoChip('regla_tacita')).toBe('TÁCITO');
  });

  it('tarea -> TAREA', () => {
    expect(tipoChip('tarea')).toBe('TAREA');
  });

  it('tipo desconocido -> mayúsculas tal cual', () => {
    expect(tipoChip('otro')).toBe('OTRO');
  });
});

describe('tipoChipColor', () => {
  it('tipos conocidos traen background/color', () => {
    expect(tipoChipColor('acceso')).toEqual({
      background: '#FF7A2F',
      color: '#1A0F2E',
    });
  });

  it('tipo desconocido -> undefined (cae al chip neutro)', () => {
    expect(tipoChipColor('resumen')).toBeUndefined();
  });
});
