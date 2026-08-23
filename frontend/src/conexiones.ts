// Fuentes del usuario: Slack, Drive/Meet y GitHub.
//
// Vive aparte de `api.ts` a propósito. `api.ts` habla el contrato v1 del juego
// (oficina, riesgo, simular) y está congelado con P3: es lo que se demuestra y
// no se toca. Esto es superficie nueva, y el backend la está escribiendo en
// paralelo mientras se escribe esta pantalla, así que cada función de aquí
// asume que su endpoint puede no existir todavía y devuelve un motivo legible
// en vez de un stack trace.
//
// Todo lo que se puede probar sin red vive en funciones puras
// (`normalizarConexiones`, `extraerUrl`, `resumenSincronizacion`,
// `leerRetornoOAuth`): son las que deciden qué ve el usuario.
import { API_BASE } from './api';
import { cabecerasAuth } from './sesion';

export type Fuente = 'slack' | 'drive' | 'github';
export type EstadoFuente = 'activa' | 'pendiente' | 'sin_conectar';
export type EstadoFuentes = Record<Fuente, EstadoFuente>;

export const FUENTES: Fuente[] = ['slack', 'drive', 'github'];

export const SIN_CONECTAR: EstadoFuentes = {
  slack: 'sin_conectar',
  drive: 'sin_conectar',
  github: 'sin_conectar',
};

/** Archivo de transcripción ya leído como texto. */
export interface Transcripcion {
  nombre: string;
  contenido: string;
}

// --- Red -------------------------------------------------------------------

/** Motivo legible de un fallo. El 404 se distingue del resto porque durante el
 * hackathon es el caso normal, no una avería: el endpoint todavía no está
 * desplegado y el usuario merece saber eso y no "Error 404". */
async function motivo(r: Response): Promise<string> {
  if (r.status === 404) return 'El servidor todavía no tiene esta función.';
  if (r.status === 401) return 'Tu sesión venció. Entra otra vez.';
  try {
    const cuerpo = await r.json();
    if (typeof cuerpo?.detail === 'string') return cuerpo.detail;
  } catch {
    /* respuesta sin JSON */
  }
  return `El servidor respondió ${r.status}.`;
}

/** Igual que el `req` privado de `api.ts`, pero con mensajes de error para
 * mostrar en pantalla (los del juego solo se logean). No se reutiliza aquel
 * porque no está exportado y `api.ts` no se toca en esta rama. */
async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
  if (!API_BASE) throw new Error('No hay servidor configurado (modo demo).');
  let r: Response;
  try {
    r = await fetch(API_BASE + ruta, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
        ...cabecerasAuth(),
      },
    });
  } catch {
    // Red caída, CORS, servidor dormido en Render: para el usuario es lo mismo.
    throw new Error('No se pudo hablar con el servidor.');
  }
  if (!r.ok) throw new Error(await motivo(r));
  return (await r.json()) as T;
}

// --- Estado de las fuentes -------------------------------------------------

/** El backend puede devolver `{conexiones:[...]}`, un array plano, o traer las
 * conexiones colgando del perfil. Las tres formas se aceptan: acertar el
 * nombre del sobre no vale una pantalla rota. */
export function normalizarConexiones(datos: unknown): EstadoFuentes {
  const posible = datos as { conexiones?: unknown } | null;
  const lista = Array.isArray(datos)
    ? datos
    : Array.isArray(posible?.conexiones)
      ? posible.conexiones
      : [];

  const estado: EstadoFuentes = { ...SIN_CONECTAR };
  for (const fila of lista) {
    const tipo = (fila as { tipo?: unknown })?.tipo;
    if (tipo !== 'slack' && tipo !== 'drive' && tipo !== 'github') continue;
    // Si el backend la lista es porque existe; solo un "pendiente" explícito
    // la degrada. Un estado que no reconocemos se lee como conectada, que es
    // lo que el backend quiso decir al devolverla.
    const crudo = (fila as { estado?: unknown }).estado;
    estado[tipo] = crudo === 'pendiente' ? 'pendiente' : 'activa';
  }
  return estado;
}

/** Estado de las tres fuentes. Lanza con un motivo legible si no se puede
 * leer: la pantalla decide mostrarlo como aviso y seguir dejando conectar. */
export async function estadoFuentes(): Promise<EstadoFuentes> {
  return normalizarConexiones(await pedir<unknown>('/conexiones'));
}

// --- Slack -----------------------------------------------------------------

/** El endpoint de arranque puede llamar `url`, `auth_url` o `authorize_url` al
 * mismo campo. Se exige `http(s)` a propósito: a esta URL se manda el
 * navegador, y un `javascript:` que llegara desde la red sería un XSS. */
export function extraerUrl(datos: unknown): string | null {
  const d = datos as Record<string, unknown> | null;
  for (const clave of ['url', 'auth_url', 'authorize_url', 'redirect']) {
    const valor = d?.[clave];
    if (typeof valor === 'string' && /^https?:\/\//i.test(valor)) return valor;
  }
  return null;
}

/** URL de autorización de Slack. El navegador se va a ella y vuelve al
 * callback del backend, que redirige de nuevo a `/conexiones`. */
export async function urlAutorizacionSlack(): Promise<string> {
  const url = extraerUrl(await pedir<unknown>('/conexiones/slack/iniciar'));
  if (!url)
    throw new Error('El servidor no devolvió la URL de autorización de Slack.');
  return url;
}

/** Frase corta con lo que trajo la ingesta. Los nombres de los campos los fija
 * el backend y todavía se están escribiendo, así que se aceptan varios y se
 * cae a un "Listo" honesto en vez de inventar cifras. */
export function resumenSincronizacion(datos: unknown): string {
  const d = (datos ?? {}) as Record<string, unknown>;
  const num = (...claves: string[]) => {
    for (const c of claves) if (typeof d[c] === 'number') return d[c] as number;
    return null;
  };
  const partes: string[] = [];
  const mensajes = num('mensajes', 'eventos', 'total');
  const canales = num('canales', 'conversaciones');
  if (mensajes !== null)
    partes.push(`${mensajes} mensaje${mensajes === 1 ? '' : 's'}`);
  if (canales !== null)
    partes.push(`${canales} canal${canales === 1 ? '' : 'es'}`);
  if (partes.length) return `Sincronizado: ${partes.join(' · ')}.`;
  if (typeof d.mensaje === 'string') return d.mensaje;
  return 'Sincronizado. Tus mensajes ya están en el mapa de conocimiento.';
}

/** Ingerir no es lo mismo que saber: la sincronización y la subida solo meten
 * eventos crudos, y el mapa de conocimiento se recalcula aparte. Sin esta
 * llamada el usuario conecta, espera dos minutos, entra a la oficina y la ve
 * exactamente igual — que es la peor forma de que algo "funcione".
 *
 * Va como mejor esfuerzo pero SE REPORTA: si el recálculo falla en silencio,
 * el usuario se queda con esa misma confusión sin saber por qué. */
async function recalcularMapa(): Promise<string> {
  try {
    await pedir<unknown>('/admin/procesar', { method: 'POST' });
    return 'Mapa de conocimiento recalculado.';
  } catch (e) {
    const porque = e instanceof Error ? e.message : 'motivo desconocido';
    return `Los datos entraron, pero el mapa no se recalculó (${porque}).`;
  }
}

/** Dispara la ingesta con el token del usuario. Tarda de segundos a minutos:
 * quien llame tiene que mostrar que está trabajando. */
export async function sincronizarSlack(): Promise<string> {
  const resumen = resumenSincronizacion(
    await pedir<unknown>('/conexiones/slack/sincronizar', { method: 'POST' }),
  );
  return `${resumen} ${await recalcularMapa()}`;
}

// --- Drive / Meet ----------------------------------------------------------

/** Transcripciones exportadas a mano desde Drive. Es el camino realista hoy:
 * el OAuth de Google pide verificación del scope de Drive y eso no cabe en un
 * hackathon, pero el archivo `.txt` que Meet deja en Drive sí. */
export async function subirTranscripciones(
  archivos: Transcripcion[],
): Promise<string> {
  const datos = await pedir<unknown>('/conexiones/drive/transcripciones', {
    method: 'POST',
    body: JSON.stringify({ archivos }),
  });

  // `POST /conexiones` es el endpoint que ya existía y lo único que persiste
  // hoy el estado de la fuente. Sin esto, recargar la pantalla después de
  // subir muestra Drive "sin conectar" aunque las transcripciones ya estén
  // dentro. Va como mejor esfuerzo: si falla, lo subido sigue subido.
  try {
    await pedir<unknown>('/conexiones', {
      method: 'POST',
      body: JSON.stringify({ tipo: 'drive' }),
    });
  } catch {
    /* el estado se recupera solo la próxima vez que el backend lo marque */
  }

  // `eventos` NO es el número de archivos: el backend parte cada transcripción
  // en trozos de ~1500 caracteres, así que casi siempre es mayor. Llamarlos
  // "transcripciones" diría que se subieron 47 archivos cuando fueron 3.
  const d = (datos ?? {}) as Record<string, unknown>;
  const archivo = archivos.length === 1 ? 'archivo' : 'archivos';
  const trozos =
    typeof d.eventos === 'number' ? ` · ${d.eventos} fragmentos` : '';
  return `Listo: ${archivos.length} ${archivo}${trozos}. ${await recalcularMapa()}`;
}

// --- Volver al demo --------------------------------------------------------

/** Salida del aviso de arriba: como el backend no mezcla datos reales con el
 * fixture, quien sincroniza su Slack en un ensayo se lleva por delante la
 * oficina del demo. `POST /admin/reset` borra lo ingerido y repuebla el
 * ejemplo. El token de Slack sigue guardado: resincronizar lo trae de vuelta.
 *
 * Destruye datos de TODA la oficina, no solo los de quien pulsa: quien llame
 * tiene que confirmar antes. */
export async function volverAlDemo(): Promise<string> {
  await pedir<unknown>('/admin/reset', { method: 'POST' });
  return `Oficina de ejemplo restaurada. ${await recalcularMapa()}`;
}

// --- Vuelta del OAuth ------------------------------------------------------

export interface RetornoOAuth {
  fuente: Fuente;
  ok: boolean;
  motivo?: string;
}

/** Lee el resultado que el callback del backend deja en la query al redirigir
 * de vuelta (`?slack=ok` o `?slack=error&motivo=...`). Se acepta también un
 * `?error=` suelto porque es lo que manda Slack cuando el usuario cancela en
 * su pantalla y el backend lo reenvía tal cual. */
export function leerRetornoOAuth(search: string): RetornoOAuth | null {
  const p = new URLSearchParams(search);
  for (const fuente of FUENTES) {
    const valor = p.get(fuente);
    if (valor === null) continue;
    const ok = valor === 'ok' || valor === 'true' || valor === '1';
    return {
      fuente,
      ok,
      motivo: ok ? undefined : p.get('motivo') || valor || undefined,
    };
  }
  const error = p.get('error');
  if (error) return { fuente: 'slack', ok: false, motivo: error };
  return null;
}
