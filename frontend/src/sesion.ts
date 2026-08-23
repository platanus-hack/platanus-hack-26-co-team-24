// Sesión del usuario contra el auth de P3 (Supabase por debajo).
//
// Lo único que vive en el navegador es el token. La personalización vive en el
// servidor, que es lo que permite abrir el juego en otro equipo y encontrar tu
// avatar. Antes de esto el avatar estaba en localStorage y no salía de ahí.
//
// En modo mock (sin VITE_API_URL) no hay sesión: el juego corre offline como
// siempre y el avatar cae a localStorage. Es el plan B del demo.

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

async function pedirSesion(
  base: string,
  ruta: string,
  cuerpo: Record<string, string>,
  errorPorDefecto: string,
): Promise<Usuario> {
  const r = await fetch(`${base}${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  if (!r.ok) throw new Error(await motivo(r, errorPorDefecto));

  const datos = (await r.json()) as { token?: string };
  if (!datos.token) throw new Error('El servidor no devolvió sesión.');
  guardarToken(datos.token);

  return yo(base);
}

export function entrar(base: string, email: string, password: string): Promise<Usuario> {
  return pedirSesion(base, '/auth/login', { email, password }, 'Email o contraseña incorrectos.');
}

export function registrar(
  base: string,
  email: string,
  password: string,
  nombre: string,
): Promise<Usuario> {
  return pedirSesion(base, '/auth/registro', { email, password, nombre }, 'No se pudo crear la cuenta.');
}

/** Quién soy según el servidor, avatar incluido. Null si el token ya no sirve. */
export async function yo(base: string): Promise<Usuario> {
  const r = await fetch(`${base}/usuarios/me`, { headers: cabecerasAuth() });
  if (r.status === 401) {
    borrarToken();
    throw new Error('La sesión venció. Entra otra vez.');
  }
  if (!r.ok) throw new Error(await motivo(r, 'No se pudo leer tu perfil.'));
  return (await r.json()) as Usuario;
}

export function salir(): void {
  borrarToken();
}
