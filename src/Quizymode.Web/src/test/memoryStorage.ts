import { vi } from "vitest";

/**
 * Node 25+ exposes its own global `localStorage`, which is unusable without
 * `--localstorage-file` and shadows jsdom's. Tests that touch localStorage
 * install this Map-backed replacement instead.
 */
export function installMemoryLocalStorage(): Storage {
  const store = new Map<string, string>();

  const storage = {
    get length() {
      return store.size;
    },
    clear: () => {
      store.clear();
    },
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  } as Storage;

  vi.stubGlobal("localStorage", storage);
  Object.defineProperty(window, "localStorage", {
    value: storage,
    configurable: true,
  });

  return storage;
}
