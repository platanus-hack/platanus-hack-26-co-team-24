import type { OfficeScene } from '../OfficeScene';
import * as renuncia from './renuncia';
import * as github from './github';
import * as roboPc from './roboPc';
import * as generic from './generic';

export type Runner = (scene: OfficeScene, personId?: string) => Promise<void>;

/** Animaciones de escenario registradas por `scenario_id`. Los que no estén
 * aquí caen al runner genérico (parpadeo rojo + extras por id, ver
 * `generic.ts`). */
export const SCENARIOS: Record<string, Runner> = {
  renuncia: (scene, personId) => renuncia.run(scene, personId ?? ''),
  github_caido: (scene) => github.run(scene),
  robo_pc: (scene) => roboPc.run(scene),
};

export const getRunner = (id: string): Runner =>
  SCENARIOS[id] ?? ((scene, personId) => generic.run(scene, personId, id));
