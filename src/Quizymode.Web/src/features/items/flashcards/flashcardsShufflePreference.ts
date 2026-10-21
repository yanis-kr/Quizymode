/** Flashcards Shuffle switch (AC 3.14.10): remembered in localStorage, session-only when storage fails. */
const STORAGE_KEY = "quizymode.flashcards.shuffle.v1";

let inMemory: boolean | null = null;

export function getFlashcardsShufflePreference(): boolean {
  if (inMemory !== null) return inMemory;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

export function setFlashcardsShufflePreference(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
    inMemory = null;
  } catch {
    inMemory = enabled;
  }
}

/** Test-only: forgets the in-memory fallback. */
export function resetFlashcardsShufflePreferenceForTests(): void {
  inMemory = null;
}
