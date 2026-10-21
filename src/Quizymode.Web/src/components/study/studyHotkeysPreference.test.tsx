import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import {
  STUDY_HOTKEYS_STORAGE_KEY,
  getStudyHotkeysEnabled,
  resetStudyHotkeysPreferenceForTests,
  setStudyHotkeysEnabled,
  useStudyHotkeysEnabled,
  useStudyHotkeysPersistFailed,
} from "./studyHotkeysPreference";

describe("studyHotkeysPreference", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    resetStudyHotkeysPreferenceForTests();
  });
  afterEach(() => vi.restoreAllMocks());

  it("defaults to on and persists the choice", () => {
    expect(getStudyHotkeysEnabled()).toBe(true);
    setStudyHotkeysEnabled(false);
    expect(window.localStorage.getItem(STUDY_HOTKEYS_STORAGE_KEY)).toBe("off");
    expect(getStudyHotkeysEnabled()).toBe(false);
    setStudyHotkeysEnabled(true);
    expect(window.localStorage.getItem(STUDY_HOTKEYS_STORAGE_KEY)).toBe("on");
  });

  it("keeps the choice for the tab and reports the failure when storage throws", () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const { result } = renderHook(() => ({ on: useStudyHotkeysEnabled(), failed: useStudyHotkeysPersistFailed() }));
    act(() => setStudyHotkeysEnabled(false));
    expect(result.current).toEqual({ on: false, failed: true });
  });

  it("follows another tab through the storage event", () => {
    const { result } = renderHook(() => useStudyHotkeysEnabled());
    expect(result.current).toBe(true);
    act(() => {
      window.localStorage.setItem(STUDY_HOTKEYS_STORAGE_KEY, "off");
      window.dispatchEvent(new StorageEvent("storage", { key: STUDY_HOTKEYS_STORAGE_KEY }));
    });
    expect(result.current).toBe(false);
  });
});
