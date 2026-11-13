import { STARTER_RUN_SIZE } from "./composeStarterRun";

/**
 * The /start run in progress for this tab (#570): `quizymode.starter.run.v1` in sessionStorage. Stores the run nonce and
 * the five item ids in order, so a reload restores the same five questions instead of composing new ones (AC 3.0.32).
 * Cleared when the run completes. Reads tolerate missing or corrupt data by returning null; writes and clears never throw.
 */
export const STARTER_RUN_STORAGE_KEY = "quizymode.starter.run.v1";
const MAX_DOCUMENT_LENGTH = 2 * 1024;

export interface StoredStarterRun {
  nonce: string;
  itemIds: string[];
}

export function readStoredStarterRun(): StoredStarterRun | null {
  try {
    const raw = window.sessionStorage.getItem(STARTER_RUN_STORAGE_KEY);
    if (!raw || raw.length > MAX_DOCUMENT_LENGTH) return null;
    const doc = JSON.parse(raw) as { version?: unknown; nonce?: unknown; itemIds?: unknown };
    if (!doc || doc.version !== 1 || typeof doc.nonce !== "string" || !Array.isArray(doc.itemIds)) return null;
    const itemIds = doc.itemIds.filter((id): id is string => typeof id === "string");
    if (itemIds.length !== STARTER_RUN_SIZE || new Set(itemIds).size !== STARTER_RUN_SIZE) return null;
    return { nonce: doc.nonce, itemIds };
  } catch {
    return null;
  }
}

export function writeStoredStarterRun(run: StoredStarterRun): void {
  try {
    window.sessionStorage.setItem(STARTER_RUN_STORAGE_KEY, JSON.stringify({ version: 1, ...run }));
  } catch {
    // Storage can be blocked; the run still works, it just is not restored after a reload.
  }
}

export function clearStoredStarterRun(): void {
  try {
    window.sessionStorage.removeItem(STARTER_RUN_STORAGE_KEY);
  } catch {
    // Nothing to clear when storage is blocked.
  }
}
