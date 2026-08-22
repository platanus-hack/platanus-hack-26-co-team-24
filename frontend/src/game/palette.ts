// Colores de tinte para la ropa de los personajes. Compartido por la escena
// del juego y (más adelante) el editor de avatar.
export const PALETTE: Record<
  'blue' | 'red' | 'green' | 'yellow' | 'purple' | 'gray',
  number
> = {
  blue: 0x00b3ff,
  red: 0xff1744,
  green: 0x00e676,
  yellow: 0xffea00,
  purple: 0xd500f9,
  gray: 0xb0bec5,
};

// Paleta cartoon sci-fi: azul-violeta profundo + acentos neón. Fuente de
// verdad para colores hex compartidos entre config.ts (backgroundColor) y
// scripts/gen-assets.mjs (sprites/tiles). index.css duplica THEME.bg porque
// CSS no puede importar TS.
export const THEME = {
  bg: '#0b0b2b',
  floorA: '#2b2d7a',
  floorB: '#34378f',
  wall: '#120f3a',
  wallEdge: '#00e5ff',
  desk: '#ff7a00',
  deskEdge: '#3a1a00',
  chair: '#ff2e88',
  server: '#00e5ff',
  serverAlt: '#7c4dff',
  coffee: '#ffd600',
  meeting: '#39ff14',
  console: '#ff00aa',
  skinLight: '#ffcc99',
  skinDark: '#8d5524',
  hairDark: '#1a1a1a',
  hairRed: '#ff3d00',
  clothesBase: '#d8d8d8',
  riskLow: '#00ff88',
  riskMid: '#ffea00',
  riskHigh: '#ff1744',
} as const;
