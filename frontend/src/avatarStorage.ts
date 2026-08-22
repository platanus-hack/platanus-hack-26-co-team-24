// Persistencia local del avatar del usuario (modo mock: sobrevive recargas
// sin backend). Usado tanto por el editor (React) como por OfficeScene para
// sobreescribir el avatar_config de p_ana antes de construir su Character.
import type { AvatarConfig } from './types';

const KEY = 'avatar';

const CUERPOS: AvatarConfig['cuerpo'][] = ['light', 'dark'];
const PEINADOS: AvatarConfig['peinado'][] = ['short', 'long'];
const ROPAS: AvatarConfig['ropa'][] = ['shirt', 'suit'];
const PALETAS: AvatarConfig['paleta'][] = [
  'blue',
  'red',
  'green',
  'yellow',
  'purple',
  'gray',
];

function isValid(v: unknown): v is AvatarConfig {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  return (
    CUERPOS.includes(c.cuerpo as AvatarConfig['cuerpo']) &&
    PEINADOS.includes(c.peinado as AvatarConfig['peinado']) &&
    ROPAS.includes(c.ropa as AvatarConfig['ropa']) &&
    PALETAS.includes(c.paleta as AvatarConfig['paleta'])
  );
}

/** Lee `localStorage.avatar` y lo valida campo por campo; `null` si falta,
 * está corrupto o tiene algún valor fuera de las opciones fijas. */
export function loadAvatar(): AvatarConfig | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Guarda la config en `localStorage.avatar`. No lanza si localStorage no
 * está disponible (p.ej. modo privado). */
export function saveAvatar(cfg: AvatarConfig): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {
    // ponytail: si localStorage falla, el avatar simplemente no sobrevive
    // la recarga en modo mock; la API real (si hay VITE_API_URL) ya persistió.
  }
}
