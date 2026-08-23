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
import { cabecerasAuth, haySesion, leerToken, yo } from './sesion';
import oficinaMock from './mocks/oficina.json';
import riesgoMock from './mocks/riesgo.json';
import escenariosMock from './mocks/escenarios.json';
import simularMock from './mocks/simular.json';

const CRUDO = import.meta.env.VITE_API_URL as string | undefined;

// Render inyecta el host sin esquema (`bus-factor-api.onrender.com`) cuando la
// variable viene de otro servicio del blueprint. Sin esto, `fetch` la trataría
// como ruta relativa y pegaría contra el propio estático.
const BASE = CRUDO?.trim()
  ? /^https?:\/\//.test(CRUDO.trim())
    ? CRUDO.trim().replace(/\/$/, '')
    : `https://${CRUDO.trim().replace(/\/$/, '')}`
  : undefined;

/** Sin VITE_API_URL corremos contra los mocks locales: lo que dependa de eso
 * (avatar en localStorage, etc.) se guía por esta bandera. */
export const IS_MOCK = !BASE;

/** Base de la API real, `null` en modo mock. La sesión la necesita para armar
 * sus URLs sin repetir la normalización del host. */
export const API_BASE = BASE ?? null;

/** Persona "yo" de la demo: en mocks es `p_ana`; contra P3, su usuario demo.
 * Configurable por si el backend cambia de dataset. */
export const DEMO_USER_ID =
  (import.meta.env.VITE_DEMO_USER_ID as string | undefined) ||
  (IS_MOCK ? 'p_ana' : 'ana@empresa.com');

// --- Identidad del jugador -------------------------------------------------
//
// Quién soy lo dice el servidor (`GET /usuarios/me`, ver `yo()` en sesion.ts),
// pero quienes preguntan son síncronos: el constructor de un `Character` y el
// estado inicial de la consola arcade. La asimetría se resuelve con una sola
// resolución por token guardada en el módulo:
//
//   - `resolverMiId()` para quien puede esperar (el spawn de la oficina ya
//     espera a `/oficina`; pedir el perfil en paralelo no cuesta un ms más).
//   - `miId()` para quien no: responde YA con lo mejor que se sepa.
//
// Nunca lanza. Sin sesión, con el token vencido o con la API caída la
// identidad cae a `DEMO_USER_ID` y el juego sigue igual; en modo mock ni
// siquiera se pregunta, porque ahí `DEMO_USER_ID` es la única identidad que
// existe. Ese es el plan B del demo y no puede depender de la red.

/** Techo para que el arranque del juego no quede colgado de `/usuarios/me`:
 * si el perfil tarda más, la oficina se puebla como demo y `miId()` se corrige
 * solo cuando la respuesta llegue. Mismo criterio que la espera de fuentes en
 * `OfficeScene.spawnCharacters()`: nada bloquea el spawn indefinidamente. */
const MS_IDENTIDAD = 3000;

let idActual = DEMO_USER_ID;
let promesaId: Promise<string> | null = null;
let tokenDeLaPromesa: string | null = null;

/** Quién soy AHORA mismo, sin esperar: el usuario de la sesión si ya se
 * resolvió, el demo si todavía no (o si no hay sesión). */
export function miId(): string {
  return idActual;
}

/** Resuelve la identidad contra el servidor y la cachea por token. Se
 * re-resuelve si el token cambió, porque entrar y salir navegan con la SPA (no
 * hay recarga): sin esto, quien entra con su cuenta después de haber abierto
 * la oficina seguiría jugando como el usuario demo. */
export function resolverMiId(): Promise<string> {
  const token = leerToken();
  if (!promesaId || tokenDeLaPromesa !== token) {
    tokenDeLaPromesa = token;
    idActual = DEMO_USER_ID;
    promesaId = pedirIdentidad(token);
  }
  return promesaId;
}

async function pedirIdentidad(token: string | null): Promise<string> {
  if (!API_BASE || !token) return DEMO_USER_ID;
  const perfil = yo(API_BASE)
    .then((u) => {
      // Puede llegar después del techo: corrige igual para quien pregunte
      // luego (la consola, o un `restart()` de la escena tras restaurar) y
      // deja la caché con la verdad en vez de con el demo. Si mientras tanto
      // cambió el token, esta respuesta ya es de otra sesión: se descarta.
      if (tokenDeLaPromesa !== token) return DEMO_USER_ID;
      idActual = u.email;
      promesaId = Promise.resolve(u.email);
      return u.email;
    })
    // Token vencido (`yo()` ya lo borró) o API caída: se sigue como demo, que
    // es exactamente lo que hace el resto del front sin sesión.
    .catch(() => DEMO_USER_ID);
  return Promise.race([
    perfil,
    new Promise<string>((ok) => setTimeout(() => ok(idActual), MS_IDENTIDAD)),
  ]);
}

// Escritorios que dibuja el mapa (`desk_0`..`desk_8`, ver scripts/gen-map.mjs).
// La oficina real puede tener más gente que puestos: el índice se cicla en vez
// de apuntar a un `desk_9` que no existe.
const DESK_COUNT = 9;

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(BASE + path, {
    ...init,
    // El Bearer va en toda petición cuando hay sesión: los endpoints públicos
    // lo ignoran y los de usuario lo necesitan. Va después de `...init` para
    // que un caller no lo pise sin querer al pasar sus propias cabeceras.
    headers: { 'Content-Type': 'application/json', ...init?.headers, ...cabecerasAuth() },
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
  // 0-100, cobertura de conocimiento del equipo (ver cerebro/README.md).
  resiliencia_equipo?: number;
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

// Última /oficina exitosa: si la API se cae justo cuando OfficeScene.restore()
// (scene.restart()) vuelve a pedirla, sin esto la oficina se queda vacía en
// vez de restaurar los 9 personajes (ver integ-report.md check f).
let lastOficina: Oficina | null = null;

export async function getOficina(): Promise<Oficina> {
  if (IS_MOCK) return structuredClone(oficinaMock as Oficina);
  try {
    const raw = await req<RawOficina>('/oficina');
    const people: Person[] = raw.miembros.map((m, i) => ({
      id: m.email,
      nombre: m.nombre,
      rol: m.rol,
      desk: i % DESK_COUNT,
      avatar_config: toAvatarConfig(m.avatar_config, i),
    }));
    lastOficina = { office: raw.oficina, people, resiliencia: raw.resiliencia_equipo };
    return structuredClone(lastOficina);
  } catch (err) {
    if (lastOficina) return structuredClone(lastOficina);
    throw err;
  }
}

// Mismo trato que `/oficina` (ver arriba): si la API se cae en el `restart()`
// de `restore()`, la sala vuelve con sus auras de riesgo en vez de con todo el
// mundo en verde.
let lastRiesgo: Riesgo | null = null;

export async function getRiesgo(): Promise<Riesgo> {
  if (IS_MOCK) return structuredClone(riesgoMock as Riesgo);
  try {
    const raw = await req<{ scores: RawScore[] }>('/riesgo');
    lastRiesgo = {
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
    return structuredClone(lastRiesgo);
  } catch (err) {
    if (lastRiesgo) return structuredClone(lastRiesgo);
    throw err;
  }
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
  // En modo demo no hay red: el editor guarda en localStorage igual.
  if (IS_MOCK) return { ok: true };
  // P3 acepta las capas en la raíz del body en ambos endpoints. Con sesión el
  // avatar queda atado a la cuenta, que es lo que hace que sobreviva al cambio
  // de equipo; sin sesión cae al endpoint sin token para no obligar a
  // registrarse durante la demo.
  const { cuerpo, peinado, ropa, paleta } = cfg;
  const ruta = haySesion()
    ? '/usuarios/me/avatar'
    : `/avatar?email=${encodeURIComponent(miId())}`;
  await req(ruta, { method: 'PUT', body: JSON.stringify({ cuerpo, peinado, ropa, paleta }) });
  return { ok: true };
}
