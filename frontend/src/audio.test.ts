import { describe, it, expect, beforeEach } from 'vitest';
import { midiToHz, LEAD, BASS, isMuted, setMuted } from './audio';

// Stub mínimo de localStorage en memoria (mismo patrón que avatarStorage.test.ts).
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

describe('midiToHz', () => {
  it('69 (A4) -> 440 Hz', () => {
    expect(midiToHz(69)).toBe(440);
  });

  it('81 (A5) -> ~880 Hz', () => {
    expect(midiToHz(81)).toBeCloseTo(880, 5);
  });
});

describe('patterns', () => {
  it('LEAD y BASS tienen 16 pasos', () => {
    expect(LEAD.length).toBe(16);
    expect(BASS.length).toBe(16);
  });
});

describe('mute (localStorage)', () => {
  beforeEach(() => {
    globalThis.localStorage = makeMemoryStorage();
  });

  it('isMuted() es false si localStorage está vacío', () => {
    expect(isMuted()).toBe(false);
  });

  it('setMuted(true) persiste y isMuted() lo refleja', () => {
    setMuted(true);
    expect(isMuted()).toBe(true);
  });

  it('setMuted no lanza sin AudioContext creado', () => {
    expect(() => setMuted(false)).not.toThrow();
  });
});
