import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import {
  getFlashcardsShufflePreference,
  resetFlashcardsShufflePreferenceForTests,
  setFlashcardsShufflePreference,
} from "./flashcardsShufflePreference";

describe("flashcardsShufflePreference", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    resetFlashcardsShufflePreferenceForTests();
  });
  afterEach(() => vi.restoreAllMocks());

  it("defaults to off and persists the choice", () => {
    expect(getFlashcardsShufflePreference()).toBe(false);
    setFlashcardsShufflePreference(true);
    expect(window.localStorage.getItem("quizymode.flashcards.shuffle.v1")).toBe("on");
    expect(getFlashcardsShufflePreference()).toBe(true);
    setFlashcardsShufflePreference(false);
    expect(getFlashcardsShufflePreference()).toBe(false);
  });

  it("falls back to the session when storage throws", () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    setFlashcardsShufflePreference(true);
    expect(getFlashcardsShufflePreference()).toBe(true);
  });
});
