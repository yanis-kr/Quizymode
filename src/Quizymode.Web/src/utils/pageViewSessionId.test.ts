import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** #752: the analytics session-id fallback must not use Math.random (CodeQL js/insecure-randomness). */
describe("pageViewTracking session id fallback (#752)", () => {
  beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses crypto.getRandomValues when randomUUID is unavailable and never calls Math.random", async () => {
    const mathRandom = vi.spyOn(Math, "random");
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.fill(0xab);
      return bytes;
    });
    vi.stubGlobal("crypto", { getRandomValues });

    const { getPageViewSessionId } = await import("./pageViewTracking");
    const id = getPageViewSessionId();

    expect(getRandomValues).toHaveBeenCalled();
    expect(mathRandom).not.toHaveBeenCalled();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(id).toBe("ab".repeat(16));
  });

  it("produces distinct ids across fresh sessions without crypto.randomUUID", async () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        for (let i = 0; i < bytes.length; i++) {
          bytes[i] = Math.floor(Math.random() * 256);
        }
        return bytes;
      },
    });

    const { getPageViewSessionId } = await import("./pageViewTracking");
    const first = getPageViewSessionId();
    sessionStorage.clear();
    vi.resetModules();
    const { getPageViewSessionId: getSecond } = await import("./pageViewTracking");
    const second = getSecond();

    expect(first).not.toBe(second);
  });

  it("falls back to a counter-based id when no Web Crypto is available", async () => {
    vi.stubGlobal("crypto", undefined);
    const mathRandom = vi.spyOn(Math, "random");

    const { getPageViewSessionId } = await import("./pageViewTracking");
    const id = getPageViewSessionId();

    expect(id).toMatch(/^\d+-\d+$/);
    expect(mathRandom).not.toHaveBeenCalled();
  });
});
