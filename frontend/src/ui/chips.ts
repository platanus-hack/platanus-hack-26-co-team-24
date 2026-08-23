// Mapeo compartido de `tipo` (item crítico) a etiqueta de chip y color,
// fiel a la guía (sección 07): TAREA turquesa, TÁCITO morado, ACCESO
// naranja; el resto cae al chip neutro (fondo LINE) que cada consumidor ya
// tiene definido en CSS. Usado por RiskTooltip.tsx y ResultPanel.tsx para
// no repetir el mapeo en dos sitios.
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
