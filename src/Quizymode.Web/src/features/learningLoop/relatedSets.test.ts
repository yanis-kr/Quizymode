import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RELATED_SETS, relatedSetsFor, showsChangeOfPace } from "./relatedSets";

/**
 * Scope paths in docs/quizymode_taxonomy.yaml, without the "keywords" wrapper level: exams/aws/saa-c03 is
 * exams > keywords > aws > keywords > saa-c03 in the file. A small indentation parser is enough for this format.
 */
function taxonomyScopePaths(): Set<string> {
  // Vitest runs from the web project (src/Quizymode.Web); the taxonomy lives two levels up in docs/.
  const text = readFileSync(resolve(process.cwd(), "..", "..", "docs", "quizymode_taxonomy.yaml"), "utf8");
  const stack: { indent: number; key: string }[] = [];
  const paths = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^(\s*)([a-z0-9-]+):/.exec(line);
    if (!match) continue;
    const indent = match[1].length;
    const key = match[2];
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop();
    stack.push({ indent, key });
    const segments = stack.map((entry) => entry.key).filter((segment) => segment !== "keywords");
    paths.add(segments.join("/"));
  }
  return paths;
}

describe("related sets map (#711)", () => {
  it("every target exists in the taxonomy (AC6)", () => {
    const known = taxonomyScopePaths();
    const targets = Object.values(RELATED_SETS).flatMap((entry) => [
      ...entry.related.map((ref) => ref.scope),
      ...(entry.changeOfPace ? [entry.changeOfPace.scope] : []),
    ]);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) expect(known.has(target), `${target} is not in the taxonomy`).toBe(true);
  });

  it("gives up to two related sets per scope, never the scope itself", () => {
    for (const [scope, entry] of Object.entries(RELATED_SETS)) {
      expect(entry.related.length).toBeLessThanOrEqual(2);
      expect(entry.related.map((ref) => ref.scope)).not.toContain(scope);
    }
  });

  it("returns null for a scope that is not in the map", () => {
    expect(relatedSetsFor("exams/aws/not-a-set")).toBeNull();
  });

  it("labels Change of pace only for exam and tech scopes (AC3)", () => {
    expect(showsChangeOfPace("exams/aws/saa-c03")).toBe(true);
    expect(showsChangeOfPace("tech/cloud")).toBe(true);
    expect(showsChangeOfPace("languages/german")).toBe(false);
  });
});
