import { describe, it, expect, vi, afterEach } from 'vitest';
import { getOficina, miId, resolverMiId, simular } from './api';
import { isValidAvatar } from './avatarStorage';

describe('api (modo mock, sin VITE_API_URL)', () => {
  it('getOficina devuelve 9 personas', async () => {
    const oficina = await getOficina();
    expect(oficina.people).toHaveLength(9);
  });

  it('simular({scenario_id: "renuncia"}) devuelve un playbook_md no vacío', async () => {
    const result = await simular({
      scenario_id: 'renuncia',
      person_id: 'p_ana',
    });
    expect(result.playbook_md.length).toBeGreaterThan(0);
  });

  it('la identidad es el usuario demo y no toca la red, aunque haya token', async () => {
    // Restricción dura del demo: sin VITE_API_URL el juego corre 100% offline.
    // Ni siquiera con un token guardado se debe preguntar por el perfil.
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    stubAlmacen('tok-viejo');

    expect(miId()).toBe('p_ana');
    await expect(resolverMiId()).resolves.toBe('p_ana');
    expect(fetchMock).not.toHaveBeenCalled();

    quitarAlmacen();
    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// Modo real: `BASE` se evalúa al importar el módulo, así que cada caso stubea
// el env, resetea el registro de módulos y re-importa `./api` (mismo patrón
// que audio.test.ts / avatarStorage.test.ts).
// ---------------------------------------------------------------------------

/** Respuesta real de GET /oficina (verificada con curl contra P3). El
 * `avatar_config` de P3 NO es el nuestro: números + paletas en español. */
const RAW_OFICINA = {
  oficina: { id: 'of-demo', nombre: 'Bus Factor HQ' },
  miembros: [
    'ana',
    'david',
    'valentina',
    'jorge',
    'brayan',
    'andres',
    'laura',
    'camila',
    'sofia',
  ].map((n, i) => ({
    email: `${n}@empresa.com`,
    nombre: `${n} Apellido`,
    rol: 'Rol',
    sprite: `lpc-0${(i % 9) + 1}`,
    avatar_config: { cuerpo: 1, peinado: 3, ropa: 2, paleta: 'coral' },
    score: 100 - i * 10,
    items_criticos: [`ki-00${i}`],
    total_items: 1,
    detalle: `detalle de ${n}`,
  })),
  resiliencia_equipo: 28.6,
};

const RAW_RIESGO = {
  scores: [
    {
      persona_id: 'ana@empresa.com',
      score: 100,
      riesgo_absoluto: 0.0,
      items_criticos: ['ki-001', 'ki-002'],
      total_items: 3,
      detalle: '3 elementos sin respaldo. Bus factor 1.',
    },
  ],
  resiliencia_equipo: 28.6,
};

const RAW_ESCENARIOS = [
  {
    id: 'renuncia',
    tipo: 'persona',
    nombre: 'Renuncia / ausencia',
    descripcion: 'Un miembro clave deja el equipo.',
    requiere_objetivo: true,
  },
  {
    id: 'robo_pc',
    tipo: 'persona',
    nombre: 'Robo del computador',
    descripcion: 'Le roban el equipo a una persona.',
    requiere_objetivo: true,
  },
  {
    id: 'caida_github',
    tipo: 'infra',
    nombre: 'Caída de GitHub',
    descripcion: 'GitHub queda inaccesible.',
    requiere_objetivo: false,
  },
];

const RAW_SIMULAR = {
  scenario_id: 'renuncia',
  objetivo_id: 'ana@empresa.com',
  items_huerfanos: [
    {
      id: 'ki-001',
      tipo: 'tarea',
      descripcion: 'Comprar tiquetes de la gerencia',
      dueño_principal: 'ana@empresa.com',
      respaldos: [],
      fuente: 'slack',
      evidencia: 'Ya quedó reservado el vuelo',
      evento_ids: [],
    },
    {
      id: 'ki-002',
      tipo: 'regla_tacita',
      descripcion: 'Al jefe solo se le reserva en LATAM',
      dueño_principal: 'ana@empresa.com',
      respaldos: [],
      fuente: 'slack',
      evidencia: 'ojo: al jefe solo le gusta viajar en LATAM',
      evento_ids: [],
    },
  ],
  impacto: '2 elemento(s) quedan sin dueño y sin respaldo.',
  playbook_md: '# Renuncia / ausencia\n\nContenido real.',
  advertencias: ['Sin ANTHROPIC_API_KEY: playbook sin narración.'],
  generado_por: 'respaldo',
};

/** Importa `./api` con `VITE_API_URL` puesto y `fetch` stubeado. Devuelve el
 * módulo y el mock de fetch para inspeccionar la request enviada. `crudo` es
 * el valor EXACTO de la variable de entorno, para poder ejercitar la
 * normalización de la URL contra el `fetch` real del módulo. */
async function importRealApi(payload: unknown, crudo = 'http://x') {
  vi.stubEnv('VITE_API_URL', crudo);
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => payload,
  }));
  vi.stubGlobal('fetch', fetchMock);
  vi.resetModules();
  const api = await import('./api');
  return { api, fetchMock };
}

describe('api (modo real, con VITE_API_URL)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('IS_MOCK es false y DEMO_USER_ID cae al usuario demo de P3', async () => {
    const { api } = await importRealApi(RAW_OFICINA);
    expect(api.IS_MOCK).toBe(false);
    expect(api.DEMO_USER_ID).toBe('ana@empresa.com');
  });

  it('getOficina mapea miembros -> people con ids email, desk por índice y office', async () => {
    const { api, fetchMock } = await importRealApi(RAW_OFICINA);
    const oficina = await api.getOficina();

    expect(fetchMock.mock.calls[0][0]).toBe('http://x/oficina');
    expect(oficina.office).toEqual({ id: 'of-demo', nombre: 'Bus Factor HQ' });
    expect(oficina.people).toHaveLength(9);
    expect(oficina.people[0].id).toBe('ana@empresa.com');
    expect(oficina.people.map((p) => p.desk)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    // P3 manda la resiliencia 0-100 con decimales: el cliente la pasa tal
    // cual y el HUD la redondea para pintarla (ver Hud.tsx).
    expect(oficina.resiliencia).toBe(28.6);
  });

  it('getOficina acota el escritorio a los 9 del mapa aunque lleguen más miembros', async () => {
    const payload = structuredClone(RAW_OFICINA);
    payload.miembros = Array.from({ length: 11 }, (_, i) => ({
      ...RAW_OFICINA.miembros[0],
      email: `p${i}@empresa.com`,
    }));
    const { api } = await importRealApi(payload);
    const oficina = await api.getOficina();

    expect(oficina.people).toHaveLength(11);
    expect(oficina.people.map((p) => p.desk)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 1,
    ]);
    for (const person of oficina.people) {
      expect(person.desk).toBeGreaterThanOrEqual(0);
      expect(person.desk).toBeLessThanOrEqual(8);
    }
  });

  it('getOficina traduce el avatar_config ajeno de P3 a configs válidas y distintas', async () => {
    const { api } = await importRealApi(RAW_OFICINA);
    const oficina = await api.getOficina();

    for (const person of oficina.people) {
      expect(isValidAvatar(person.avatar_config)).toBe(true);
    }
    const distintas = new Set(
      oficina.people.map((p) => JSON.stringify(p.avatar_config)),
    );
    expect(distintas.size).toBe(9);
  });

  it('getOficina respeta un avatar_config que ya venga en nuestro formato', async () => {
    const nuestro = {
      cuerpo: 'dark',
      peinado: 'long',
      ropa: 'suit',
      paleta: 'purple',
    };
    const payload = structuredClone(RAW_OFICINA) as unknown as {
      miembros: { avatar_config: unknown }[];
    };
    payload.miembros[0].avatar_config = nuestro;
    const { api } = await importRealApi(payload);
    const oficina = await api.getOficina();
    expect(oficina.people[0].avatar_config).toEqual(nuestro);
  });

  it('getOficina cae al último resultado exitoso si la API falla (restore offline)', async () => {
    const { api, fetchMock } = await importRealApi(RAW_OFICINA);
    await api.getOficina(); // primera llamada exitosa: cachea

    fetchMock.mockImplementationOnce(async () => {
      throw new TypeError('Failed to fetch');
    });
    const oficina = await api.getOficina();
    expect(oficina.people).toHaveLength(9);
  });

  it('getRiesgo cae al último resultado exitoso si la API falla (restore offline)', async () => {
    const { api, fetchMock } = await importRealApi(RAW_RIESGO);
    await api.getRiesgo(); // primera llamada exitosa: cachea

    fetchMock.mockImplementationOnce(async () => {
      throw new TypeError('Failed to fetch');
    });
    const riesgo = await api.getRiesgo();
    expect(riesgo.scores[0].person_id).toBe('ana@empresa.com');
  });

  it('getRiesgo mapea persona_id -> person_id y expone el detalle como primer item', async () => {
    const { api } = await importRealApi(RAW_RIESGO);
    const riesgo = await api.getRiesgo();

    expect(riesgo.scores[0].person_id).toBe('ana@empresa.com');
    expect(riesgo.scores[0].score).toBe(100);
    expect(riesgo.scores[0].items_criticos[0]).toEqual({
      id: 'detalle',
      tipo: 'resumen',
      descripcion: '3 elementos sin respaldo. Bus factor 1.',
    });
    expect(riesgo.scores[0].items_criticos.map((i) => i.id)).toEqual([
      'detalle',
      'ki-001',
      'ki-002',
    ]);
  });

  it('getEscenarios envuelve el array plano y renombra requiere_objetivo -> requiere_persona', async () => {
    const { api } = await importRealApi(RAW_ESCENARIOS);
    const { scenarios } = await api.getEscenarios();

    expect(scenarios).toHaveLength(3);
    const requiere = Object.fromEntries(
      scenarios.map((s) => [s.id, s.requiere_persona]),
    );
    expect(requiere).toEqual({
      renuncia: true,
      robo_pc: true,
      caida_github: false,
    });
  });

  it('simular envía objetivo_id y adapta impacto (string) a {tareas, texto}', async () => {
    const { api, fetchMock } = await importRealApi(RAW_SIMULAR);
    const result = await api.simular({
      scenario_id: 'renuncia',
      person_id: 'ana@empresa.com',
    });

    const init = fetchMock.mock.calls[0][1]!;
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      scenario_id: 'renuncia',
      objetivo_id: 'ana@empresa.com',
    });

    expect(result.person_id).toBe('ana@empresa.com');
    expect(result.impacto.tareas).toBe(2);
    expect(result.impacto.texto).toBe(RAW_SIMULAR.impacto);
    expect(result.playbook_md).toBe(RAW_SIMULAR.playbook_md);
    expect(result.items_huerfanos[0]).toEqual({
      id: 'ki-001',
      tipo: 'tarea',
      descripcion: 'Comprar tiquetes de la gerencia',
    });
  });

  it('simular avisa por consola si el backend devuelve advertencias', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { api } = await importRealApi(RAW_SIMULAR);
    await api.simular({
      scenario_id: 'renuncia',
      person_id: 'ana@empresa.com',
    });
    expect(warn).toHaveBeenCalled();
  });

  it('putAvatar hace PUT /usuarios/me/avatar con las capas en la raíz del body', async () => {
    const { api, fetchMock } = await importRealApi({ ok: true });
    const res = await api.putAvatar({
      cuerpo: 'dark',
      peinado: 'long',
      ropa: 'suit',
      paleta: 'purple',
    });

    expect(res).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // El dueño sale del token, nunca del cliente: no hay endpoint que acepte
    // un email por query.
    expect(fetchMock.mock.calls[0][0]).toBe('http://x/usuarios/me/avatar');
    const init = fetchMock.mock.calls[0][1]!;
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({
      cuerpo: 'dark',
      peinado: 'long',
      ropa: 'suit',
      paleta: 'purple',
    });
  });

  it('putAvatar con sesión guarda en la cuenta y manda el Bearer', async () => {
    // Es lo que hace que el avatar sobreviva al cambio de equipo: sin sesión
    // el backend no sabe de quién es.
    const datos = new Map([['bfhq.token', 'tok-123']]);
    globalThis.localStorage = {
      getItem: (k: string) => datos.get(k) ?? null,
      setItem: (k: string, v: string) => void datos.set(k, v),
      removeItem: (k: string) => void datos.delete(k),
      clear: () => datos.clear(),
      key: () => null,
      length: datos.size,
    } as Storage;

    const { api, fetchMock } = await importRealApi({ ok: true });
    await api.putAvatar({ cuerpo: 'dark', peinado: 'long', ropa: 'suit', paleta: 'red' });

    expect(fetchMock.mock.calls[0][0]).toBe('http://x/usuarios/me/avatar');
    const init = fetchMock.mock.calls[0][1]! as RequestInit & {
      headers: Record<string, string>;
    };
    expect(init.headers.Authorization).toBe('Bearer tok-123');
    datos.clear();
  });

  it('VITE_DEMO_USER_ID sobreescribe el usuario demo', async () => {
    vi.stubEnv('VITE_DEMO_USER_ID', 'otro@empresa.com');
    const { api } = await importRealApi(RAW_OFICINA);
    expect(api.DEMO_USER_ID).toBe('otro@empresa.com');
  });
});

describe('normalización de VITE_API_URL', () => {
  // Render entrega el host pelado cuando la variable viene de otro servicio del
  // blueprint. Sin esquema, fetch lo trata como ruta relativa y pega contra el
  // propio estático en vez de contra la API. Se comprueba sobre la URL que sale
  // por `fetch`, no sobre una copia del ternario de api.ts.
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('le pone https al host pelado que inyecta Render', async () => {
    const { api, fetchMock } = await importRealApi(
      RAW_OFICINA,
      'bus-factor-api.onrender.com',
    );
    await api.getOficina();
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://bus-factor-api.onrender.com/oficina',
    );
  });

  it('respeta una URL completa y no deja doble barra', async () => {
    const { api, fetchMock } = await importRealApi(RAW_OFICINA, 'https://x/');
    await api.getOficina();
    expect(fetchMock.mock.calls[0][0]).toBe('https://x/oficina');
  });

  it('vacío sigue significando modo mock (sin red)', async () => {
    const { api, fetchMock } = await importRealApi(RAW_OFICINA, '   ');
    expect(api.IS_MOCK).toBe(true);
    const oficina = await api.getOficina();
    expect(oficina.people[0].id).toBe('p_ana');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Identidad del jugador. Antes la decidía una variable de build: te registrabas
// como carlos@ y el juego te seguía tratando como Ana (su conocimiento, su
// riesgo, tu avatar pintado encima de ella).
// ---------------------------------------------------------------------------

const PERFIL = {
  email: 'carlos@empresa.com',
  nombre: 'Carlos Pérez',
  rol: 'Dev',
  sprite: 'lpc-03',
  avatar_config: {
    cuerpo: 'dark',
    peinado: 'short',
    ropa: 'shirt',
    paleta: 'green',
  },
};

const ok = (payload: unknown) => ({
  ok: true,
  status: 200,
  json: async () => payload,
});

/** localStorage en memoria (mismo stub que sesion.test.ts). Devuelve el mapa
 * para poder comprobar que el token vencido se borró. */
function stubAlmacen(token?: string): Map<string, string> {
  const datos = new Map<string, string>();
  if (token) datos.set('bfhq.token', token);
  globalThis.localStorage = {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    removeItem: (k: string) => void datos.delete(k),
    clear: () => datos.clear(),
    key: () => null,
    get length() {
      return datos.size;
    },
  } as Storage;
  return datos;
}

function quitarAlmacen(): void {
  delete (globalThis as { localStorage?: Storage }).localStorage;
}

/** Importa `./api` en modo real con un `fetch` que responde según la URL. */
async function importApiConFetch(responder: (url: string) => unknown) {
  vi.stubEnv('VITE_API_URL', 'http://x');
  const fetchMock = vi.fn((url: string, _init?: RequestInit) =>
    Promise.resolve(responder(url)),
  );
  vi.stubGlobal('fetch', fetchMock);
  vi.resetModules();
  const api = await import('./api');
  return { api, fetchMock };
}

describe('identidad del jugador (miId / resolverMiId)', () => {
  afterEach(() => {
    quitarAlmacen();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('sin sesión manda el usuario demo y no se pide el perfil', async () => {
    stubAlmacen();
    const { api, fetchMock } = await importApiConFetch(() => ok(PERFIL));

    expect(api.miId()).toBe('ana@empresa.com');
    await expect(api.resolverMiId()).resolves.toBe('ana@empresa.com');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('con sesión manda el email del servidor, no el usuario demo', async () => {
    stubAlmacen('tok-123');
    const { api, fetchMock } = await importApiConFetch(() => ok(PERFIL));

    await expect(api.resolverMiId()).resolves.toBe('carlos@empresa.com');
    // Y queda disponible para los lectores síncronos (Character, la consola).
    expect(api.miId()).toBe('carlos@empresa.com');

    expect(fetchMock.mock.calls[0][0]).toBe('http://x/usuarios/me');
    const init = fetchMock.mock.calls[0][1] as RequestInit & {
      headers: Record<string, string>;
    };
    expect(init.headers.Authorization).toBe('Bearer tok-123');
  });

  it('el perfil se pide UNA vez aunque pregunten muchos', async () => {
    // La escena, la consola y cada `restart()` preguntan por su cuenta.
    stubAlmacen('tok-123');
    const { api, fetchMock } = await importApiConFetch(() => ok(PERFIL));

    await Promise.all([api.resolverMiId(), api.resolverMiId()]);
    await api.resolverMiId();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('token vencido a mitad de sesión: cae al demo y borra el token', async () => {
    const datos = stubAlmacen('tok-vencido');
    const { api } = await importApiConFetch(() => ({
      ok: false,
      status: 401,
      json: async () => ({ detail: 'La sesión venció.' }),
    }));

    await expect(api.resolverMiId()).resolves.toBe('ana@empresa.com');
    expect(api.miId()).toBe('ana@empresa.com');
    expect(datos.has('bfhq.token')).toBe(false);
  });

  it('API caída: no lanza, se sigue jugando como el usuario demo', async () => {
    stubAlmacen('tok-123');
    const { api } = await importApiConFetch(() => {
      throw new TypeError('Failed to fetch');
    });

    await expect(api.resolverMiId()).resolves.toBe('ana@empresa.com');
  });

  it('entrar sin recargar (SPA) re-resuelve la identidad', async () => {
    // /entrar navega con el router: el módulo sobrevive al cambio de cuenta.
    const datos = stubAlmacen();
    const { api } = await importApiConFetch(() => ok(PERFIL));

    await expect(api.resolverMiId()).resolves.toBe('ana@empresa.com');
    datos.set('bfhq.token', 'tok-nuevo');
    await expect(api.resolverMiId()).resolves.toBe('carlos@empresa.com');
    expect(api.miId()).toBe('carlos@empresa.com');
  });

  it('un perfil lento no cuelga el arranque y se corrige al llegar', async () => {
    vi.useFakeTimers();
    stubAlmacen('tok-123');
    let responder: (r: unknown) => void = () => {};
    const lenta = new Promise((r) => {
      responder = r;
    });
    const { api } = await importApiConFetch(() => lenta);

    const pendiente = api.resolverMiId();
    await vi.advanceTimersByTimeAsync(3000);
    // El techo: la oficina arranca como demo en vez de quedarse en blanco.
    await expect(pendiente).resolves.toBe('ana@empresa.com');

    responder(ok(PERFIL));
    await vi.advanceTimersByTimeAsync(1);
    // Y cuando el perfil llega tarde, corrige a quien pregunte después: la
    // consola arcade, o el `restart()` de la escena tras restaurar.
    expect(api.miId()).toBe('carlos@empresa.com');
    await expect(api.resolverMiId()).resolves.toBe('carlos@empresa.com');
  });
});
