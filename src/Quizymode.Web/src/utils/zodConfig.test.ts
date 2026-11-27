import { describe, expect, it, vi } from "vitest";

// AC 4.6.24: the web app never calls eval or `new Function` through Zod, so a Content-Security-Policy without 'unsafe-eval'
// reports no script-src violation.
describe("zodConfig", () => {
  it("runs Zod without the JIT so it never probes new Function", async () => {
    const realFunction = globalThis.Function;
    const probe = vi.fn(realFunction);
    globalThis.Function = probe;
    try {
      vi.resetModules();
      await import("./zodConfig");
      const { z } = await import("zod");
      const schema = z.object({ title: z.string().min(1), tags: z.array(z.string()).default([]) });
      expect(schema.parse({ title: "Notes" })).toEqual({ title: "Notes", tags: [] });
      expect(schema.safeParse({ title: "" }).success).toBe(false);
      expect(z.config().jitless).toBe(true);
      expect(probe).not.toHaveBeenCalled();
    } finally {
      globalThis.Function = realFunction;
    }
  });
});

// AC 4.6.24: chunks of the production build can run before main.tsx's first import, so every schema module orders the
// setting itself by importing z from zodConfig (#918).
describe("zod imports", () => {
  it("AC 4.6.24: only zodConfig imports z from the zod package", () => {
    const sources = import.meta.glob("../**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    const direct = Object.entries(sources)
      .filter(([file, text]) => !/\.test\.tsx?$/.test(file) && /from\s+["']zod(\/[^"']*)?["']/.test(text))
      .map(([file]) => file);
    expect(Object.keys(sources).length).toBeGreaterThan(100);
    expect(direct).toEqual(["./zodConfig.ts"]);
  });
});
