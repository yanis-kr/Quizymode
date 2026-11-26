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
