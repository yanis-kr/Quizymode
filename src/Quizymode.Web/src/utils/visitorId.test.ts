import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VISITOR_ID_STORAGE_KEY, getVisitorId } from "./visitorId";
import { installMemoryLocalStorage } from "@/test/memoryStorage";

describe("visitorId", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = installMemoryLocalStorage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("creates and persists a UUID on first call", () => {
    vi.stubGlobal(
      "crypto",
      { randomUUID: vi.fn(() => "11111111-1111-1111-1111-111111111111") } as unknown as Crypto
    );

    const visitorId = getVisitorId();

    expect(visitorId).toBe("11111111-1111-1111-1111-111111111111");
    expect(storage.getItem(VISITOR_ID_STORAGE_KEY)).toBe(
      "11111111-1111-1111-1111-111111111111"
    );
  });

  it("reuses the stored visitor id across calls (and tabs, via localStorage)", () => {
    storage.setItem(VISITOR_ID_STORAGE_KEY, "22222222-2222-2222-2222-222222222222");

    expect(getVisitorId()).toBe("22222222-2222-2222-2222-222222222222");
    expect(getVisitorId()).toBe("22222222-2222-2222-2222-222222222222");
  });

  it("replaces a stored value that is not a syntactically valid UUID", () => {
    storage.setItem(VISITOR_ID_STORAGE_KEY, "not-a-uuid");
    vi.stubGlobal(
      "crypto",
      { randomUUID: vi.fn(() => "33333333-3333-3333-3333-333333333333") } as unknown as Crypto
    );

    const visitorId = getVisitorId();

    expect(visitorId).toBe("33333333-3333-3333-3333-333333333333");
    expect(storage.getItem(VISITOR_ID_STORAGE_KEY)).toBe(
      "33333333-3333-3333-3333-333333333333"
    );
  });

  it("returns null and stores nothing when Global Privacy Control is on", () => {
    vi.stubGlobal("navigator", { globalPrivacyControl: true } as unknown as Navigator);

    const visitorId = getVisitorId();

    expect(visitorId).toBeNull();
    expect(storage.getItem(VISITOR_ID_STORAGE_KEY)).toBeNull();
  });

  it("returns null without throwing when localStorage is unavailable", () => {
    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    expect(() => getVisitorId()).not.toThrow();
    expect(getVisitorId()).toBeNull();
  });
});
