// Mapea el score de riesgo (0-100) a un color, con `palette.ts` (THEME) como
// única fuente de verdad para los valores hex. Sin dependencias de Phaser
// para poder testear en Node puro.
import { THEME } from './palette';

const hexToNum = (hex: string): number => parseInt(hex.replace('#', ''), 16);

const RISK_LOW = hexToNum(THEME.riskLow);
const RISK_MID = hexToNum(THEME.riskMid);
const RISK_HIGH = hexToNum(THEME.riskHigh);

export const scoreToColor = (s: number): number => {
  if (s <= 40) return RISK_LOW;
  if (s <= 70) return RISK_MID;
  return RISK_HIGH;
};

export const isCritical = (s: number): boolean => s > 70;

// Niveles de riesgo tal como los define la guía (sección 04 · AURAS DE
// RIESGO): 0-39 bajo, 40-69 medio, 70-100 alto. Nota: los cortes NO
// coinciden con `scoreToColor` (40 -> lima ahí, 40 -> "medio"/oro aquí):
// son dos escalas distintas con dueños distintos. `Character.setRisk` usa
// `riskLevel` (no `scoreToColor`) para decidir el aura.
export type RiskLevel = 'bajo' | 'medio' | 'alto';

export const riskLevel = (s: number): RiskLevel => {
  if (s <= 39) return 'bajo';
  if (s <= 69) return 'medio';
  return 'alto';
};

/** Color numérico (para `Arc#setFillStyle`) de cada nivel de riesgo. */
export const RISK_LEVEL_COLOR: Record<RiskLevel, number> = {
  bajo: RISK_LOW,
  medio: RISK_MID,
  alto: RISK_HIGH,
};
