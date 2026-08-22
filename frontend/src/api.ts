// Cliente único de la API de P3. Sin VITE_API_URL -> modo demo offline con mocks locales.
import type {
  AvatarConfig,
  Oficina,
  Riesgo,
  Scenario,
  SimulationResult,
} from './types';
import oficinaMock from './mocks/oficina.json';
import riesgoMock from './mocks/riesgo.json';
import escenariosMock from './mocks/escenarios.json';
import simularMock from './mocks/simular.json';

const BASE = import.meta.env.VITE_API_URL as string | undefined;

async function req<T>(path: string, mock: T, init?: RequestInit): Promise<T> {
  if (!BASE) return structuredClone(mock); // ponytail: sin VITE_API_URL = modo demo offline
  const r = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}

export const getOficina = () =>
  req<Oficina>('/oficina', oficinaMock as Oficina);
export const getRiesgo = () => req<Riesgo>('/riesgo', riesgoMock as Riesgo);
export const getEscenarios = () =>
  req<{ scenarios: Scenario[] }>(
    '/escenarios',
    escenariosMock as { scenarios: Scenario[] },
  );
export const simular = (body: { scenario_id: string; person_id?: string }) =>
  req<SimulationResult>('/simular', simularMock as SimulationResult, {
    method: 'POST',
    body: JSON.stringify(body),
  });
export const putAvatar = (cfg: AvatarConfig) =>
  req<{ ok: boolean }>(
    '/avatar',
    { ok: true },
    { method: 'PUT', body: JSON.stringify(cfg) },
  );
