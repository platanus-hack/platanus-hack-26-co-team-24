import type { OfficeScene } from '../OfficeScene';
import * as renuncia from './renuncia';
import * as generic from './generic';

export type Runner = (scene: OfficeScene, personId?: string) => Promise<void>;

/** Animaciones de escenario registradas por `scenario_id`. Los que no estén
 * aquí caen al runner genérico (parpadeo rojo). */
export const SCENARIOS: Record<string, Runner> = {
  renuncia: (scene, personId) => renuncia.run(scene, personId ?? ''),
};

export const getRunner = (id: string): Runner => SCENARIOS[id] ?? generic.run;
