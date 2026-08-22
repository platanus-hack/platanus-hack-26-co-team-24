import { describe, it, expect, beforeEach } from 'vitest';
import { loadAvatar, saveAvatar } from './avatarStorage';
import type { AvatarConfig } from './types';

// Stub mínimo de localStorage en memoria (no hace falta jsdom para esto).
function makeMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

describe('avatarStorage', () => {
  beforeEach(() => {
    globalThis.localStorage = makeMemoryStorage();
  });

  it('loadAvatar devuelve null si no hay nada guardado', () => {
    expect(loadAvatar()).toBeNull();
  });

  it('loadAvatar devuelve null si el valor guardado tiene un campo inválido', () => {
    localStorage.setItem(
      'avatar',
      JSON.stringify({ cuerpo: 'green', peinado: 'short', ropa: 'shirt', paleta: 'blue' }),
    );
    expect(loadAvatar()).toBeNull();
  });

  it('loadAvatar devuelve null si el JSON está corrupto', () => {
    localStorage.setItem('avatar', '{not json');
    expect(loadAvatar()).toBeNull();
  });

  it('saveAvatar + loadAvatar hace round-trip de la config', () => {
    const cfg: AvatarConfig = {
      cuerpo: 'dark',
      peinado: 'long',
      ropa: 'suit',
      paleta: 'purple',
    };
    saveAvatar(cfg);
    expect(loadAvatar()).toEqual(cfg);
  });
});
