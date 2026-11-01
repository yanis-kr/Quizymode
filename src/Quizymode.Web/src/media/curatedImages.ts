import type { ItemImageReference } from "@/types/api";

/**
 * Curated question pictures (#407). Keys look like "curated:flags/fr" and map to
 * src/assets/curated/flags/fr.webp. A URL is only ever read from the build-time map below, never built
 * from the key, so an unknown or hostile key resolves to null.
 */
export const CURATED_KEY_PATTERN = /^curated:[a-z0-9-]+(\/[a-z0-9-]+)+$/;
export const CURATED_ALT_MAX_LENGTH = 300;

const GLOB_PREFIX = "../assets/curated/";

export type CuratedImageMap = ReadonlyMap<string, string>;

/** Turns glob results ("../assets/curated/flags/fr.webp" -> url) into a key -> url map. */
export function buildCuratedImageMap(modules: Record<string, string>): CuratedImageMap {
  const map = new Map<string, string>();
  for (const [modulePath, url] of Object.entries(modules)) {
    if (!modulePath.startsWith(GLOB_PREFIX) || !modulePath.endsWith(".webp")) continue;
    const key = `curated:${modulePath.slice(GLOB_PREFIX.length, -".webp".length)}`;
    if (CURATED_KEY_PATTERN.test(key)) map.set(key, url);
  }
  return map;
}

// Eager so the map is synchronous; the assets themselves are emitted as files (never inlined, see vite.config.ts).
const bundledModules = import.meta.glob("../assets/curated/**/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const bundledMap: CuratedImageMap = buildCuratedImageMap(bundledModules);

/** Returns the bundled image URL for a key, or null when the key is malformed or not bundled. */
export function resolveCuratedImage(key: string, map: CuratedImageMap = bundledMap): string | null {
  if (typeof key !== "string" || !CURATED_KEY_PATTERN.test(key)) return null;
  return map.get(key) ?? null;
}

/** True when the value has the shape of an ItemImageReference (used when reading stored snapshots). */
export function isItemImageReference(value: unknown): value is ItemImageReference {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.key === "string" &&
    CURATED_KEY_PATTERN.test(candidate.key) &&
    candidate.key.length <= 100 &&
    typeof candidate.altText === "string" &&
    candidate.altText.length > 0 &&
    candidate.altText.length <= CURATED_ALT_MAX_LENGTH
  );
}
