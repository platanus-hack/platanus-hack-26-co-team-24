// Cliente único de la API de P3. Sin VITE_API_URL -> modo demo offline con mocks locales.
//
// El backend real de P3 no habla exactamente nuestro contrato v1 (emails como
// ids, `requiere_objetivo`, `impacto` como texto, `/escenarios` como array
// plano, sin `PUT /avatar`). Toda la adaptación vive AQUÍ: el resto del front
// sigue viendo los tipos de `types.ts`.
import type {
  AvatarConfig,
  ItemCritico,
  Oficina,
  Person,
  Riesgo,
  Scenario,
  SimulationResult,
} from './types';
import {
  CUERPOS,
  PALETAS,
  PEINADOS,
  ROPAS,
  isValidAvatar,
} from './avatarStorage';
import oficinaMock from './mocks/oficina.json';
import riesgoMock from './mocks/riesgo.json';
import escenariosMock from './mocks/escenarios.json';
import simularMock from './mocks/simular.json';

const BASE = import.meta.env.VITE_API_URL as string | undefined;

/** Sin VITE_API_URL corremos contra los mocks locales: lo que dependa de eso
 * (avatar en localStorage, etc.) se guía por esta bandera. */
export const IS_MOCK = !BASE;

/** Persona "yo" de la demo: en mocks es `p_ana`; contra P3, su usuario demo.
 * Configurable por si el backend cambia de dataset. */
export const DEMO_USER_ID =
  (import.meta.env.VITE_DEMO_USER_ID as string | undefined) ||
  (IS_MOCK ? 'p_ana' : 'ana@empresa.com');

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}

// --- Formas reales de P3 (verificadas con curl) ----------------------------

interface RawMiembro {
  email: string;
  nombre: string;
  rol: string;
  avatar_config: unknown;
}
interface RawOficina {
  oficina: { id: string; nombre: string };
  miembros: RawMiembro[];
}
interface RawScore {
  persona_id: string;
  score: number;
  items_criticos: string[];
  detalle: string;
}
interface RawEscenario {
  id: string;
  tipo: Scenario['tipo'];
  nombre: string;
  descripcion: string;
  requiere_objetivo: boolean;
}
interface RawSimulacion {
  scenario_id: string;
  objetivo_id?: string;
  items_huerfanos: ItemCritico[];
  impacto: string;
  playbook_md: string;
  advertencias?: string[];
}

/** Config determinista por índice: P3 manda `avatar_config` en otro formato
 * (números + paletas en español), así que fabricamos una válida y distinta
 * para cada persona en vez de pintar 9 clones. */
function fallbackAvatar(i: number): AvatarConfig {
  return {
    cuerpo: CUERPOS[i % CUERPOS.length],
    peinado: PEINADOS[Math.floor(i / 2) % PEINADOS.length],
    ropa: ROPAS[Math.floor(i / 4) % ROPAS.length],
    paleta: PALETAS[i % PALETAS.length],
  };
}

const toAvatarConfig = (raw: unknown, i: number): AvatarConfig =>
  isValidAvatar(raw) ? raw : fallbackAvatar(i);

// --- Endpoints -------------------------------------------------------------

export async function getOficina(): Promise<Oficina> {
  if (IS_MOCK) return structuredClone(oficinaMock as Oficina);
  const raw = await req<RawOficina>('/oficina');
  const people: Person[] = raw.miembros.map((m, i) => ({
    id: m.email,
    nombre: m.nombre,
    rol: m.rol,
    desk: i,
    avatar_config: toAvatarConfig(m.avatar_config, i),
  }));
  return { office: raw.oficina, people };
}

export async function getRiesgo(): Promise<Riesgo> {
  if (IS_MOCK) return structuredClone(riesgoMock as Riesgo);
  const raw = await req<{ scores: RawScore[] }>('/riesgo');
  return {
    // ponytail: P3 sólo manda ids de item; el `detalle` (frase legible) va
    // como primer "item" para que el tooltip diga algo útil.
    scores: raw.scores.map((s) => ({
      person_id: s.persona_id,
      score: s.score,
      items_criticos: [
        { id: 'detalle', tipo: 'resumen', descripcion: s.detalle },
        ...s.items_criticos.map((id) => ({
          id,
          tipo: 'item',
          descripcion: id,
        })),
      ],
    })),
  };
}

export async function getEscenarios(): Promise<{ scenarios: Scenario[] }> {
  if (IS_MOCK)
    return structuredClone(escenariosMock as { scenarios: Scenario[] });
  const raw = await req<RawEscenario[]>('/escenarios');
  return {
    scenarios: raw.map((e) => ({
      id: e.id,
      tipo: e.tipo,
      nombre: e.nombre,
      descripcion: e.descripcion,
      requiere_persona: e.requiere_objetivo,
    })),
  };
}

export async function simular(body: {
  scenario_id: string;
  person_id?: string;
}): Promise<SimulationResult> {
  if (IS_MOCK) return structuredClone(simularMock as SimulationResult);
  const raw = await req<RawSimulacion>('/simular', {
    method: 'POST',
    body: JSON.stringify({
      scenario_id: body.scenario_id,
      objetivo_id: body.person_id,
    }),
  });
  if (raw.advertencias?.length)
    console.warn('/simular advertencias:', raw.advertencias);
  return {
    scenario_id: raw.scenario_id,
    person_id: raw.objetivo_id ?? body.person_id,
    // P3 manda items con más campos (dueño, respaldos, evidencia): nos
    // quedamos con los tres que pinta la UI.
    items_huerfanos: raw.items_huerfanos.map(({ id, tipo, descripcion }) => ({
      id,
      tipo,
      descripcion,
    })),
    impacto: { tareas: raw.items_huerfanos.length, texto: raw.impacto },
    playbook_md: raw.playbook_md,
  };
}

export async function putAvatar(cfg: AvatarConfig): Promise<{ ok: boolean }> {
  // P3 todavía no expone PUT /avatar: no llamamos a la red para no ensuciar
  // la demo con un 404. El editor ya guarda en localStorage en ambos modos.
  if (!IS_MOCK)
    console.info('PUT /avatar pendiente en P3; guardado local', cfg);
  return { ok: true };
}
