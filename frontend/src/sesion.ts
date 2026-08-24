// Sesión del usuario contra el auth de P3 (Supabase por debajo).
//
// Se entra SOLO con Google y solo con un correo del dominio de la empresa: el
// backend manda el navegador a Supabase, Supabase lo devuelve a `/entrar` con
// el token en el fragmento de la URL, y el dominio lo verifica el servidor
// contra el email que confirma Supabase.
//
// Lo único que vive en el navegador es el token. La personalización vive en el
// servidor, que es lo que permite abrir el juego en otro equipo y encontrar tu
// avatar.
//
// En modo mock (sin VITE_API_URL) no hay sesión: el juego corre offline con
// datos de mentira, sin nada del equipo.

const CLAVE_TOKEN = 'bfhq.token';

export interface Usuario {
  email: string;
  nombre: string;
  rol: string;
  sprite: string;
  avatar_config: unknown;
}

/** Falla en modo privado o con las cookies bloqueadas; ahí no hay sesión y ya.
 * `globalThis` y no `window` para que también funcione en las pruebas, que
 * corren en node y sustituyen el almacén por uno en memoria. */
function almacen(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function leerToken(): string | null {
  return almacen()?.getItem(CLAVE_TOKEN) ?? null;
}

export function guardarToken(token: string): void {
  almacen()?.setItem(CLAVE_TOKEN, token);
}

export function borrarToken(): void {
  almacen()?.removeItem(CLAVE_TOKEN);
}

export function haySesion(): boolean {
  return Boolean(leerToken());
}

/** Cabeceras con el Bearer, si hay sesión. Vacío si no. */
export function cabecerasAuth(): Record<string, string> {
  const token = leerToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Mensaje de error legible a partir de la respuesta de FastAPI. */
async function motivo(r: Response, porDefecto: string): Promise<string> {
  try {
    const cuerpo = await r.json();
    const detalle = cuerpo?.detail;
    if (typeof detalle === 'string') return detalle;
  } catch {
    /* respuesta sin JSON */
  }
  return porDefecto;
}

/** A dónde mandar el navegador para entrar. El backend redirige a Supabase
 * porque es él quien sabe la URL del proyecto. */
export function urlLoginGoogle(base: string): string {
  return `${base}/auth/google`;
}

/** El retorno de Google, leído UNA vez del fragmento de la URL.
 *
 * Se memoriza a nivel de módulo porque el fragmento se limpia al leerlo (el
 * token no tiene por qué quedar en la barra ni en el historial) y `useEffect`
 * corre dos veces en StrictMode: sin la memoria, el segundo pase vería una URL
 * vacía y creería que nadie volvió de Google. */
let retorno: { token?: string; error?: string } | null = null;

export function retornoDeGoogle(): { token?: string; error?: string } {
  if (retorno) return retorno;
  const hash = globalThis.location?.hash ?? '';
  if (!hash.includes('access_token') && !hash.includes('error')) return (retorno = {});

  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const token = params.get('access_token');
  if (token) guardarToken(token);
  globalThis.history?.replaceState(null, '', location.pathname + location.search);

  return (retorno = token
    ? { token }
    : { error: params.get('error_description') ?? params.get('error') ?? 'Google no devolvió sesión.' });
}

/** Quién soy según el servidor, avatar incluido. Null si el token ya no sirve. */
export async function yo(base: string): Promise<Usuario> {
  const r = await fetch(`${base}/usuarios/me`, { headers: cabecerasAuth() });
  if (r.status === 401 || r.status === 403) {
    const detalle = await motivo(r, 'La sesión venció. Entra otra vez.');
    borrarToken();
    throw new Error(detalle);
  }
  if (!r.ok) throw new Error(await motivo(r, 'No se pudo leer tu perfil.'));
  return (await r.json()) as Usuario;
}

export function salir(): void {
  borrarToken();
}
