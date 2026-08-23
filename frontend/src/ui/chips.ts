// Mapeo compartido de `tipo` (item crítico) a etiqueta de chip y color,
// fiel a la guía (sección 07): TAREA turquesa, TÁCITO morado, ACCESO
// naranja; el resto cae al chip neutro (fondo LINE) que cada consumidor ya
// tiene definido en CSS. Usado por RiskTooltip.tsx y ResultPanel.tsx para
// no repetir el mapeo en dos sitios.
import type { CSSProperties } from 'react';
import { THEME } from '../game/palette';

const TIPO_LABEL: Record<string, string> = {
  tarea: 'TAREA',
  regla_tacita: 'TÁCITO',
  acceso: 'ACCESO',
  proceso: 'PROCESO',
};

export const tipoChip = (tipo: string): string =>
  TIPO_LABEL[tipo] ?? tipo.toUpperCase();

export interface ChipColor {
  background: string;
  color: string;
}

const TIPO_CHIP_COLOR: Record<string, ChipColor> = {
  tarea: { background: THEME.turquesa, color: THEME.base },
  regla_tacita: { background: THEME.morado, color: THEME.texto },
  acceso: { background: THEME.naranja, color: THEME.base },
};

/** `undefined` para tipos sin receta de color en la guía: el consumidor cae
 * a su chip neutro por defecto. */
export const tipoChipColor = (tipo: string): ChipColor | undefined =>
  TIPO_CHIP_COLOR[tipo];

/** Estilo inline listo para `style={}`: igual que `tipoChipColor` pero con
 * `border: 'none'` explícito, para que un chip con receta de color no
 * arrastre el borde de 1px del chip neutro (fidelidad literal a la guía,
 * sección 07: los chips de tipo con color propio no llevan borde). */
export const tipoChipStyle = (tipo: string): CSSProperties | undefined => {
  const c = tipoChipColor(tipo);
  return c ? { ...c, border: 'none' } : undefined;
};
