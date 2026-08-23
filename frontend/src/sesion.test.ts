import { describe, expect, it, beforeEach } from 'vitest';
import { borrarToken, cabecerasAuth, guardarToken, haySesion, leerToken, salir } from './sesion';

// Mismo stub en memoria que avatarStorage.test.ts: no hace falta jsdom.
function almacenEnMemoria(): Storage {
  const datos = new Map<string, string>();
  return {
    getItem: (k: string) => (datos.has(k) ? datos.get(k)! : null),
    setItem: (k: string, v: string) => void datos.set(k, v),
    removeItem: (k: string) => void datos.delete(k),
    clear: () => datos.clear(),
    key: (i: number) => Array.from(datos.keys())[i] ?? null,
    get length() {
      return datos.size;
    },
  } as Storage;
}

describe('sesión', () => {
  beforeEach(() => {
    globalThis.localStorage = almacenEnMemoria();
  });

  it('sin token no manda Authorization', () => {
    expect(haySesion()).toBe(false);
    expect(cabecerasAuth()).toEqual({});
  });

  it('con token lo manda como Bearer', () => {
    guardarToken('abc123');
    expect(haySesion()).toBe(true);
    expect(leerToken()).toBe('abc123');
    expect(cabecerasAuth()).toEqual({ Authorization: 'Bearer abc123' });
  });

  it('salir borra la sesión', () => {
    guardarToken('abc123');
    salir();
    expect(leerToken()).toBeNull();
    expect(haySesion()).toBe(false);
  });

  it('sin almacén no revienta: no hay sesión y ya', () => {
    // Modo privado o cookies bloqueadas. Un juego que se cae al abrirlo en
    // incógnito es peor que uno sin sesión.
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('bloqueado');
      },
    });
    expect(haySesion()).toBe(false);
    expect(cabecerasAuth()).toEqual({});
    expect(() => guardarToken('x')).not.toThrow();
    expect(() => borrarToken()).not.toThrow();
  });
});
