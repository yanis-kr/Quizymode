import { useSyncExternalStore } from "react";

/**
 * "Single-key shortcuts" switch (AC 3.16.7, WCAG 2.1.4): on by default, remembered in localStorage and synced
 * across tabs. When storage is unavailable the choice still applies to this tab.
 */
export const STUDY_HOTKEYS_STORAGE_KEY = "quizymode.study-hotkeys.v1";

let memoryValue: boolean | null = null;
let persistFailed = false;
let storageListenerAttached = false;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function getStudyHotkeysEnabled(): boolean {
  if (memoryValue !== null) return memoryValue;
  try {
    return window.localStorage.getItem(STUDY_HOTKEYS_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function getStudyHotkeysPersistFailed(): boolean {
  return persistFailed;
}

export function setStudyHotkeysEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(STUDY_HOTKEYS_STORAGE_KEY, enabled ? "on" : "off");
    memoryValue = null;
    persistFailed = false;
  } catch {
    memoryValue = enabled;
    persistFailed = true;
  }
  emit();
}

function onStorage(event: StorageEvent): void {
  if (event.key !== null && event.key !== STUDY_HOTKEYS_STORAGE_KEY) return;
  memoryValue = null;
  persistFailed = false;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!storageListenerAttached) {
    window.addEventListener("storage", onStorage);
    storageListenerAttached = true;
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && storageListenerAttached) {
      window.removeEventListener("storage", onStorage);
      storageListenerAttached = false;
    }
  };
}

export function useStudyHotkeysEnabled(): boolean {
  return useSyncExternalStore(subscribe, getStudyHotkeysEnabled, () => true);
}

export function useStudyHotkeysPersistFailed(): boolean {
  return useSyncExternalStore(subscribe, getStudyHotkeysPersistFailed, () => false);
}

/** Test-only: forgets in-memory state. */
export function resetStudyHotkeysPreferenceForTests(): void {
  memoryValue = null;
  persistFailed = false;
}
