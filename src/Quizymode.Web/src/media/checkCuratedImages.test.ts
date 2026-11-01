import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const script = path.resolve(__dirname, "../../scripts/check-curated-images.mjs");

describe("scripts/check-curated-images.mjs", () => {
  let tmp: string;
  let src: string;
  let dist: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "curated-check-"));
    src = path.join(tmp, "src");
    dist = path.join(tmp, "dist");
    fs.mkdirSync(path.join(src, "flags"), { recursive: true });
    fs.mkdirSync(path.join(dist, "assets", "m"), { recursive: true });
  });

  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  function run() {
    return spawnSync(process.execPath, [script, "--src", src, "--dist", dist], { encoding: "utf8" });
  }

  it("passes when there are no pictures at all", () => {
    expect(run().status).toBe(0);
  });

  it("passes when every distinct source webp is emitted under assets/m and none is inlined", () => {
    fs.writeFileSync(path.join(src, "flags", "fr.webp"), "france");
    fs.writeFileSync(path.join(src, "flags", "it.webp"), "italy");
    fs.writeFileSync(path.join(dist, "assets", "m", "aaa.webp"), "france");
    fs.writeFileSync(path.join(dist, "assets", "m", "bbb.webp"), "italy");
    fs.writeFileSync(path.join(dist, "assets", "index-1.js"), 'const a="/assets/m/aaa.webp";');
    expect(run().status).toBe(0);
  });

  it("counts identical source files once", () => {
    fs.writeFileSync(path.join(src, "flags", "fr.webp"), "same");
    fs.writeFileSync(path.join(src, "flags", "xx.webp"), "same");
    fs.writeFileSync(path.join(dist, "assets", "m", "aaa.webp"), "same");
    expect(run().status).toBe(0);
  });

  it("fails when a webp is inlined as a data URI", () => {
    fs.writeFileSync(path.join(src, "flags", "fr.webp"), "france");
    fs.writeFileSync(path.join(dist, "assets", "m", "aaa.webp"), "france");
    fs.writeFileSync(path.join(dist, "assets", "index-1.js"), 'const a="data:image/webp;base64,AAAA";');
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("data:image/webp");
  });

  it("fails when the emitted count differs from the source count", () => {
    fs.writeFileSync(path.join(src, "flags", "fr.webp"), "france");
    fs.writeFileSync(path.join(src, "flags", "it.webp"), "italy");
    fs.writeFileSync(path.join(dist, "assets", "m", "aaa.webp"), "france");
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("expected 2");
  });

  it("fails when a webp is emitted outside assets/m", () => {
    fs.writeFileSync(path.join(dist, "assets", "fr-123.webp"), "france");
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("outside assets/m");
  });
});
