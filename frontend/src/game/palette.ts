// Colores de tinte para la ropa de los personajes. Compartido por la escena
// del juego y (más adelante) el editor de avatar.
// Nombres de clave = esquema histórico (blue/red/green/...); los valores son
// los de la paleta Synth Dusk (ver THEME más abajo).
export const PALETTE: Record<
  'blue' | 'red' | 'green' | 'yellow' | 'purple' | 'gray',
  number
> = {
  blue: 0x2bd9d0, // turquesa
  red: 0xff4d9d, // rosa
  green: 0xb6ff3c, // lima
  yellow: 0xffd166, // oro
  purple: 0x7b3fe4, // morado
  gray: 0xa98bff, // lila
};

// Colores de tinte para el pelo: mismas 6 claves que PALETTE + naranja (sólo
// disponible como pelo, nunca como ropa en el editor de avatar histórico).
export const HAIR_PALETTE = {
  blue: 0x2bd9d0, // turquesa
  red: 0xff4d9d, // rosa
  green: 0xb6ff3c, // lima
  yellow: 0xffd166, // oro
  purple: 0x7b3fe4, // morado
  gray: 0xa98bff, // lila
  orange: 0xff7a2f, // naranja
} as const;

export type PairKey = keyof typeof HAIR_PALETTE;

// 9 pares fijos [pelo, ropa] de la guía (sección 04 · sprite sheet), en orden
// de slot (Ana, David, Samuel, Andrés, slots 5-9). Nunca dos personajes con
// el mismo par (Task B se encarga de asignarlos sin repetir).
// Nota: los pares 4/8 y 6/9 coinciden en la guía (oro+morado dos veces,
// morado+naranja dos veces: "oro" == "rubio" y "morado" == "ciruela" son el
// mismo hex con nombre de sabor distinto) — se transcriben tal cual el texto
// de la guía indica.
export const PAIRS: [PairKey, PairKey][] = [
  ['blue', 'red'], // turquesa + rosa (Ana)
  ['orange', 'green'], // naranja + lima (David)
  ['gray', 'blue'], // lila + turquesa (Samuel)
  ['yellow', 'purple'], // oro + morado (Andrés)
  ['red', 'yellow'], // rosa + oro (slot 5)
  ['purple', 'orange'], // morado (ciruela) + naranja (slot 6)
  ['green', 'gray'], // lima + lila (slot 7)
  ['yellow', 'purple'], // oro (rubio) + morado (slot 8)
  ['purple', 'orange'], // morado + naranja (slot 9)
];

// Paleta Synth Dusk: 11 colores + texto. Fuente de verdad para colores hex
// compartidos entre config.ts (backgroundColor), risk.ts/RiskTooltip.tsx
// (niveles de riesgo) y scripts/gen-assets.mjs (COLORS, espejo manual porque
// un script Node standalone no puede importar TS del proyecto). index.css y
// ui.css duplican algunos de estos valores porque CSS no puede importar TS.
//
// Un color, un papel (ver docs/design/guia-visual.txt): turquesa nunca es
// botón, rosa nunca es dato, lima = "funciona", rojo sólo en emergencia
// activa o riesgo >= 70.
export const THEME = {
  void: '#120A20',
  base: '#1A0F2E',
  surface: '#241543',
  line: '#43276B',
  turquesa: '#2BD9D0',
  rosa: '#FF4D9D',
  lima: '#B6FF3C',
  oro: '#FFD166',
  naranja: '#FF7A2F',
  lila: '#A98BFF',
  morado: '#7B3FE4',
  rojo: '#FF2E63',
  texto: '#F3E8FF',
  texto2: '#A98CD6',

  // --- Alias históricos (código existente los sigue consumiendo) ---
  bg: '#1A0F2E', // = base
  riskLow: '#B6FF3C', // = lima
  riskMid: '#FFD166', // = oro
  riskHigh: '#FF2E63', // = rojo
  wall: '#43276B', // = line
  floorA: '#1A0F2E', // = base
  floorB: '#1E1140', // damero del piso (segundo tono, fuera de los 11 base)
  desk: '#A98BFF', // = lila
  chair: '#7B3FE4', // = morado
  server: '#2BD9D0', // = turquesa
  coffee: '#FF7A2F', // = naranja
  meeting: '#7B3FE4', // = morado
  console: '#FF4D9D', // = rosa
} as const;
