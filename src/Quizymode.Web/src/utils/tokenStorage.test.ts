import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearTokens,
  getToken,
  getTokenExpiration,
  hasToken,
  isTokenExpired,
  setTokens,
} from "./tokenStorage";

function createToken(payload: object): string {
  return `header.${btoa(JSON.stringify(payload))}.signature`;
}

function createStorage(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear: () => {
      store.clear();
    },
    getItem: (key: string) => {
      return store.get(key) ?? null;
    },
    key: (index: number) => {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  } as Storage;
}

describe("tokenStorage", () => {
  beforeEach(() => {
    const storage = createStorage();
    vi.stubGlobal("localStorage", storage);
    Object.defineProperty(window, "localStorage", {
      value: storage,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prefers the ID token and falls back to the access token", () => {
    localStorage.setItem("accessToken", "access-token");
    expect(getToken()).toBe("access-token");

    localStorage.setItem("idToken", "id-token");
    expect(getToken()).toBe("id-token");
  });

  it("reports whether any token exists", () => {
    expect(hasToken()).toBe(false);

    localStorage.setItem("accessToken", "access-token");

    expect(hasToken()).toBe(true);
  });

  it("stores only the provided tokens and clears both keys", () => {
    setTokens("access-token", null);

    expect(localStorage.getItem("accessToken")).toBe("access-token");
    expect(localStorage.getItem("idToken")).toBeNull();

    setTokens(null, "id-token");

    expect(localStorage.getItem("accessToken")).toBe("access-token");
    expect(localStorage.getItem("idToken")).toBe("id-token");

    clearTokens();

    expect(localStorage.getItem("accessToken")).toBeNull();
    expect(localStorage.getItem("idToken")).toBeNull();
  });

  it("treats null, malformed, or claimless tokens as expired", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(isTokenExpired(null)).toBe(true);
    expect(isTokenExpired("not-a-jwt")).toBe(true);
    expect(isTokenExpired(createToken({ sub: "user-1" }))).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
  });

  it("treats tokens expiring inside the buffer as expired", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);

    const expiringSoon = createToken({ exp: Math.floor(1_000_000 / 1000) + 30 });
    const stillValid = createToken({ exp: Math.floor(1_000_000 / 1000) + 120 });

    expect(isTokenExpired(expiringSoon)).toBe(true);
    expect(isTokenExpired(stillValid)).toBe(false);
    expect(isTokenExpired(stillValid, 180)).toBe(true);
  });

  it("returns expiration time for valid tokens and null otherwise", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const token = createToken({ exp: 1_725_000_000 });
    const invalidJsonToken = "header.invalid-json.signature";

    expect(getTokenExpiration(token)).toBe(1_725_000_000);
    expect(getTokenExpiration(createToken({ sub: "user-1" }))).toBeNull();
    expect(getTokenExpiration(invalidJsonToken)).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });
});
