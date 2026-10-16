import { lazy, type ComponentType } from "react";

/** sessionStorage key guarding the one-time automatic reload after a chunk-load failure (PERF-001). */
export const CHUNK_RELOAD_KEY = "quizymode:chunk-reload";

const CHUNK_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk [\w-]+ failed|ChunkLoadError/i;

export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "ChunkLoadError" || CHUNK_ERROR_PATTERN.test(error.message);
}

export function readReloadFlag(): boolean {
  try {
    return window.sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1";
  } catch {
    return true; // storage unavailable: never auto-reload, avoid loops
  }
}

export function setReloadFlag(): boolean {
  try {
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

/** Clears the reload guard once a lazy page has loaded successfully. */
function clearReloadFlag(): void {
  try {
    window.sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  } catch {
    // ignore
  }
}

/**
 * React.lazy wrapper. Every lazy route goes through this so a build check / test can assert
 * which routes are split. A successful load clears the one-time reload guard.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<P extends Record<string, any>>(
  factory: () => Promise<{ default: ComponentType<P> }>
): ComponentType<P> {
  return lazy(() =>
    factory().then((module) => {
      clearReloadFlag();
      return module;
    })
  );
}
