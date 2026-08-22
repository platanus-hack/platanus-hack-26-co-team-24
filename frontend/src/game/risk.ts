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
