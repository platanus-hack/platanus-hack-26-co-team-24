import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  SIN_CONECTAR,
  extraerUrl,
  leerRetornoOAuth,
  normalizarConexiones,
  resumenSincronizacion,
} from './conexiones';

// Las funciones puras son las que deciden qué ve el usuario cuando el backend
// contesta algo distinto de lo esperado, que durante el hackathon es el caso
// normal: se prueban solas, sin red.

describe('normalizarConexiones', () => {
  it('acepta el sobre {conexiones:[...]}', () => {
    expect(
      normalizarConexiones({
        conexiones: [
          { tipo: 'slack', estado: 'activa' },
          { tipo: 'drive', estado: 'pendiente' },
        ],
      }),
    ).toEqual({ slack: 'activa', drive: 'pendiente', github: 'sin_conectar' });
  });

  it('acepta el array plano', () => {
    expect(
      normalizarConexiones([{ tipo: 'github', estado: 'activa' }]),
    ).toEqual({
      slack: 'sin_conectar',
      drive: 'sin_conectar',
      github: 'activa',
    });
  });

  it('una conexión listada con estado desconocido cuenta como activa', () => {
    // Si el backend la devuelve es porque existe. Pintarla "sin conectar" por
    // no reconocer la palabra le pediría al usuario repetir un OAuth que ya
    // hizo.
    expect(normalizarConexiones([{ tipo: 'slack', estado: 'ok' }]).slack).toBe(
      'activa',
    );
    expect(normalizarConexiones([{ tipo: 'slack' }]).slack).toBe('activa');
  });

  it('ignora tipos que no son fuentes y formas que no son lista', () => {
    expect(normalizarConexiones([{ tipo: 'jira', estado: 'activa' }])).toEqual(
      SIN_CONECTAR,
    );
    expect(normalizarConexiones(null)).toEqual(SIN_CONECTAR);
    expect(normalizarConexiones({ ok: true })).toEqual(SIN_CONECTAR);
    expect(normalizarConexiones('vaya')).toEqual(SIN_CONECTAR);
  });
});

describe('extraerUrl', () => {
  it('encuentra la url venga con el nombre que venga', () => {
    expect(extraerUrl({ url: 'https://slack.com/oauth' })).toBe(
      'https://slack.com/oauth',
    );
    expect(extraerUrl({ auth_url: 'https://slack.com/a' })).toBe(
      'https://slack.com/a',
    );
    expect(extraerUrl({ authorize_url: 'http://localhost:8000/x' })).toBe(
      'http://localhost:8000/x',
    );
  });

  it('rechaza lo que no es http(s)', () => {
    // A esta URL se manda el navegador: un `javascript:` que llegara desde la
    // red sería un XSS con la sesión del usuario puesta.
    expect(extraerUrl({ url: 'javascript:alert(1)' })).toBeNull();
    expect(extraerUrl({ url: '/relativa' })).toBeNull();
    expect(extraerUrl({ url: 42 })).toBeNull();
    expect(extraerUrl(null)).toBeNull();
  });
});

describe('resumenSincronizacion', () => {
  it('cuenta lo que trajo la ingesta y singulariza bien', () => {
    expect(resumenSincronizacion({ mensajes: 120, canales: 4 })).toBe(
      'Sincronizado: 120 mensajes · 4 canales.',
    );
    expect(resumenSincronizacion({ mensajes: 1, canales: 1 })).toBe(
      'Sincronizado: 1 mensaje · 1 canal.',
    );
  });

  it('acepta los nombres alternativos del backend', () => {
    expect(resumenSincronizacion({ eventos: 7 })).toBe(
      'Sincronizado: 7 mensajes.',
    );
  });

  it('sin cifras no inventa ninguna', () => {
    expect(resumenSincronizacion({ ok: true })).toContain('Sincronizado');
    expect(
      resumenSincronizacion({ mensaje: 'Cola encolada, tarda un rato.' }),
    ).toBe('Cola encolada, tarda un rato.');
    expect(resumenSincronizacion(null)).toContain('Sincronizado');
  });
});

describe('leerRetornoOAuth', () => {
  it('lee el éxito del callback', () => {
    expect(leerRetornoOAuth('?slack=ok')).toEqual({
      fuente: 'slack',
      ok: true,
      motivo: undefined,
    });
  });

  it('lee el fallo con su motivo', () => {
    expect(
      leerRetornoOAuth('?slack=error&motivo=token%20inv%C3%A1lido'),
    ).toEqual({
      fuente: 'slack',
      ok: false,
      motivo: 'token inválido',
    });
  });

  it('entiende el ?error= suelto que reenvía Slack al cancelar', () => {
    expect(leerRetornoOAuth('?error=access_denied')).toEqual({
      fuente: 'slack',
      ok: false,
      motivo: 'access_denied',
    });
  });

  it('sin parámetros no hay retorno', () => {
    expect(leerRetornoOAuth('')).toBeNull();
    expect(leerRetornoOAuth('?otra=cosa')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Red. `API_BASE` se evalúa al importar `api.ts`, así que cada caso stubea el
// env y re-importa el módulo (mismo patrón que api.test.ts).
// ---------------------------------------------------------------------------

async function importarConFetch(
  respuesta: Partial<Response> & { json?: () => Promise<unknown> },
) {
  vi.stubEnv('VITE_API_URL', 'http://x');
  // Los parámetros van declarados (aunque no se usen) para que `mock.calls`
  // tenga tipo de tupla y `calls[0][0]` compile.
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) => respuesta,
  );
  vi.stubGlobal('fetch', fetchMock);
  vi.resetModules();
  const mod = await import('./conexiones');
  return { mod, fetchMock };
}

describe('conexiones contra el servidor', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('estadoFuentes pega a /conexiones y normaliza la respuesta', async () => {
    const { mod, fetchMock } = await importarConFetch({
      ok: true,
      status: 200,
      json: async () => ({ conexiones: [{ tipo: 'slack', estado: 'activa' }] }),
    });
    await expect(mod.estadoFuentes()).resolves.toEqual({
      slack: 'activa',
      drive: 'sin_conectar',
      github: 'sin_conectar',
    });
    expect(fetchMock.mock.calls[0][0]).toBe('http://x/conexiones');
  });

  it('un 404 se explica como función que todavía no existe, no como error 404', async () => {
    // Es el estado normal mientras el backend se escribe en paralelo: el
    // mensaje va a pantalla y tiene que significar algo para quien lo lea.
    const { mod } = await importarConFetch({
      ok: false,
      status: 404,
      json: async () => ({}),
    });
    await expect(mod.estadoFuentes()).rejects.toThrow(
      /todavía no tiene esta función/,
    );
  });

  it('un detail de FastAPI se muestra tal cual', async () => {
    const { mod } = await importarConFetch({
      ok: false,
      status: 422,
      json: async () => ({ detail: 'tipo debe ser slack o drive' }),
    });
    await expect(mod.estadoFuentes()).rejects.toThrow(
      'tipo debe ser slack o drive',
    );
  });

  it('la red caída no filtra el TypeError de fetch a la pantalla', async () => {
    vi.stubEnv('VITE_API_URL', 'http://x');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    vi.resetModules();
    const mod = await import('./conexiones');
    await expect(mod.estadoFuentes()).rejects.toThrow(
      'No se pudo hablar con el servidor.',
    );
  });

  it('urlAutorizacionSlack falla claro si el servidor no manda URL', async () => {
    const { mod } = await importarConFetch({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    await expect(mod.urlAutorizacionSlack()).rejects.toThrow(
      /no devolvió la URL/,
    );
  });

  it('subirTranscripciones cuenta archivos y fragmentos por separado', async () => {
    // `eventos` son los trozos de ~1500 caracteres en que el backend parte
    // cada archivo, no los archivos: decir "47 transcripciones" cuando se
    // subió una sola sería mentir sobre lo que acaba de pasar.
    const { mod, fetchMock } = await importarConFetch({
      ok: true,
      status: 200,
      json: async () => ({ eventos: 47 }),
    });
    const texto = await mod.subirTranscripciones([
      { nombre: 'reunion.txt', contenido: 'hola' },
    ]);
    expect(texto).toContain('1 archivo');
    expect(texto).toContain('47 fragmentos');
    expect(texto).not.toContain('47 transcripciones');

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://x/conexiones/drive/transcripciones',
    );
    expect(fetchMock.mock.calls[1][0]).toBe('http://x/conexiones');
    // Sin recalcular, la oficina se queda igual: ingerir no es saber.
    expect(fetchMock.mock.calls[2][0]).toBe('http://x/admin/procesar');
  });

  it('sincronizar recalcula el mapa y lo dice', async () => {
    const { mod, fetchMock } = await importarConFetch({
      ok: true,
      status: 200,
      json: async () => ({ mensajes: 120, canales: 4 }),
    });
    const texto = await mod.sincronizarSlack();
    expect(texto).toContain('120 mensajes · 4 canales');
    expect(texto).toContain('recalculado');
    expect(fetchMock.mock.calls[1][0]).toBe('http://x/admin/procesar');
  });

  it('si el recálculo falla, la ingesta cuenta pero el fallo se dice', async () => {
    // Callarlo dejaría al usuario esperando un cambio en la oficina que no va
    // a llegar, sin saber por qué.
    vi.stubEnv('VITE_API_URL', 'http://x');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/admin/procesar')
          ? {
              ok: false,
              status: 500,
              json: async () => ({ detail: 'sin API key' }),
            }
          : { ok: true, status: 200, json: async () => ({ mensajes: 9 }) },
      ),
    );
    vi.resetModules();
    const mod = await import('./conexiones');
    const texto = await mod.sincronizarSlack();
    expect(texto).toContain('9 mensajes');
    expect(texto).toContain('no se recalculó');
    expect(texto).toContain('sin API key');
  });

  it('volverAlDemo resetea y repuebla el mapa', async () => {
    // Sin el recálculo, `reset` deja el estado limpio pero la oficina vacía:
    // el backend avisa de que hay que correr `procesar` para repoblar.
    const { mod, fetchMock } = await importarConFetch({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    await expect(mod.volverAlDemo()).resolves.toContain('restaurada');
    expect(fetchMock.mock.calls[0][0]).toBe('http://x/admin/reset');
    expect(fetchMock.mock.calls[1][0]).toBe('http://x/admin/procesar');
  });

  it('en modo mock ninguna llamada toca la red', async () => {
    // El modo mock es el plan B del demo: si esta pantalla intentara un fetch
    // sin servidor, se colgaría justo cuando el plan B tiene que funcionar.
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.resetModules();
    const mod = await import('./conexiones');
    await expect(mod.estadoFuentes()).rejects.toThrow(/modo demo/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
