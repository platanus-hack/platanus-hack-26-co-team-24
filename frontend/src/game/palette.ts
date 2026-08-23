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
// Nota: la guía usa nombres de sabor distintos para colores que ya existen
// en la lista de 11 ("oro" == "rubio", "morado" == "ciruela"), lo que hacía
// que los pares 4/8 y 6/9 colapsaran en el mismo hex literal. Ruling del
// controlador (fix commit): mantener slots 1-7 tal cual la guía y resolver
// la colisión reasignando slots 8 y 9 a combinaciones no usadas en ningún
// otro slot, para que los 9 pares sean únicos como exige palette.test.ts.
export const PAIRS: [PairKey, PairKey][] = [
  ['blue', 'red'], // turquesa + rosa (Ana)
  ['orange', 'green'], // naranja + lima (David)
  ['gray', 'blue'], // lila + turquesa (Samuel)
  ['yellow', 'purple'], // oro + morado (Andrés)
  ['red', 'yellow'], // rosa + oro (slot 5)
  ['purple', 'orange'], // morado (ciruela) + naranja (slot 6)
  ['green', 'gray'], // lima + lila (slot 7)
  ['yellow', 'blue'], // oro + turquesa (slot 8, reasignado para ser único)
  ['red', 'green'], // rosa + lima (slot 9, reasignado para ser único)
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

// Grilla y sprites (guía, secciones 03 TILES · 32PX y 04 SPRITE SHEET):
// una sola fuente de verdad para todo el juego. Nadie más debe declarar
// estas constantes: el mapa (scripts/gen-map.mjs), el canvas
// (game/config.ts, 23x13 tiles = 736x416) y los spritesheets generados
// (scripts/gen-assets.mjs) están cuadrados con estos números.
export const TILE = 32;
export const SPRITE_W = 32;
export const SPRITE_H = 52;
/** Sala completa en píxeles de mundo: 23x13 tiles. El canvas cubre toda la
 * ventana (Scale.RESIZE) y la cámara escala/centra este rectángulo. */
export const MAP_COLS = 23;
export const MAP_ROWS = 13;
export const MAP_W = MAP_COLS * TILE;
export const MAP_H = MAP_ROWS * TILE;

// Las cuatro personas que la guía nombra en la sección 04 llevan un par de
// colores concreto ("Ana · OPS: pelo turquesa + ropa rosa"). Se fijan por id
// para que la demo se vea como la guía; el resto reparte los slots libres.
// Contra la API real el id es el EMAIL (ver `api.ts` y `backend/personas.py`),
// así que las mismas cuatro personas van listadas en sus dos formas: si no,
// los pares nombrados por la guía sólo valían en modo mock.
const GUIDE_SLOT: Record<string, number> = {
  p_ana: 0, // turquesa + rosa
  'ana@empresa.com': 0,
  p_david: 1, // naranja + lima
  'david@empresa.com': 1,
  p_samuel: 2, // lila + turquesa
  'samuel@empresa.com': 2,
  p_andres: 3, // oro + morado
  'andres@empresa.com': 3,
};

/** Reparte los 9 pares [pelo, ropa] entre la gente de la oficina sin repetir
 * ninguno (regla dura de la guía: "nunca dos personajes con el mismo par").
 * Las personas nombradas por la guía toman su slot; las demás, en orden de
 * llegada, los que queden libres. Con más de 9 personas los pares se
 * reciclan (no ocurre en el demo, que tiene exactamente 9 escritorios). */
export function assignPairs(
  people: readonly { id: string }[],
): Record<string, [PairKey, PairKey]> {
  const out: Record<string, [PairKey, PairKey]> = {};
  const free = PAIRS.map((_, i) => i);

  for (const person of people) {
    const slot = GUIDE_SLOT[person.id];
    if (slot === undefined || out[person.id]) continue;
    const i = free.indexOf(slot);
    if (i < 0) continue; // ya lo tomó otra persona
    free.splice(i, 1);
    out[person.id] = PAIRS[slot];
  }

  let k = 0;
  for (const person of people) {
    if (out[person.id]) continue;
    out[person.id] = PAIRS[free.length ? free[k % free.length] : 0];
    k++;
  }
  return out;
}
