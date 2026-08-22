// Comportamiento ambiental de los personajes. Puro (sin Phaser) para poder
// testear la distribución de estados y las duraciones sin levantar el juego.

export type State = 'trabajando' | 'cafe' | 'reunion' | 'caminar';

const WEIGHTS: [State, number][] = [
  ['trabajando', 0.7],
  ['cafe', 0.1],
  ['reunion', 0.15],
  ['caminar', 0.05],
];

export function nextState(r = Math.random()): State {
  let acc = 0;
  for (const [s, w] of WEIGHTS) {
    acc += w;
    if (r < acc) return s;
  }
  return 'trabajando';
}

export const durationMs = (_: State, r = Math.random()) => 4000 + r * 8000;

// "La sala respira" (guía, sección 05 /OFICINA): nunca más de 3 personajes
// caminando ambientalmente a la vez. `OfficeScene.moving` es el contador
// compartido; `Character.tick()` sólo arranca un `walkTo` ambiental si hay
// cupo, si no espera y reintenta. Los runners de escenario llaman `walkTo`
// directamente (sin pasar por `tick()`), así que nunca quedan bloqueados por
// este límite: deben poder correr siempre.
export const MAX_MOVING = 3;
export const canMove = (moving: number): boolean => moving < MAX_MOVING;

// Puntos por los que un personaje "caminando" puede pasear.
const WALK_TARGETS = ['coffee', 'meeting', 'door'] as const;

/** Punto (nombre en `scene.points`) al que debe dirigirse un personaje para
 * un estado dado. `deskIndex` es el escritorio propio del personaje (0-8).
 * `rng` es inyectable para tests deterministas del caso 'caminar'. */
export function pointFor(
  state: State,
  deskIndex: number,
  rng: () => number = Math.random,
): string {
  switch (state) {
    case 'trabajando':
      return `desk_${deskIndex}`;
    case 'cafe':
      return 'coffee';
    case 'reunion':
      return 'meeting';
    case 'caminar':
      return WALK_TARGETS[Math.floor(rng() * WALK_TARGETS.length)];
  }
}
