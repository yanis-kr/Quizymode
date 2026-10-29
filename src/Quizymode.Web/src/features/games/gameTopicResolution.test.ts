import { describe, expect, it } from "vitest";
import { resolveGameTopics } from "./gameTopicResolution";
import { gameContextId, gameScopeKey } from "./gameScope";

describe("game topic precedence and identity", () => {
  it("honors explicit scopes before All topics and preferences", () => {
    expect(resolveGameTopics(true, true, "error", ["history"])).toEqual({ mode: "explicit" });
    expect(resolveGameTopics(false, true, "loading", ["history"])).toEqual({ mode: "all" });
  });
  it("waits, reports errors, and asks before playing globally", () => {
    expect(resolveGameTopics(false, false, "loading", [])).toEqual({ mode: "loading" });
    expect(resolveGameTopics(false, false, "error", [])).toEqual({ mode: "error" });
    expect(resolveGameTopics(false, false, "ready", [])).toEqual({ mode: "choose" });
  });
  it("preserves every saved refinement and canonicalizes only the record key order", () => {
    expect(resolveGameTopics(false, false, "ready", ["languages/french/core", "science"])).toEqual({ mode: "topics", topics: ["languages/french/core", "science"] });
    const first = gameScopeKey({ kind: "topics", topics: ["science", "languages/french/core"] });
    expect(first).toBe("topics:languages/french/core,science");
    expect(first).toBe(gameScopeKey({ kind: "topics", topics: ["languages/french/core", "science"] }));
    expect(first).not.toBe(gameScopeKey({ kind: "topics", topics: ["languages/german/core", "science"] }));
    expect(first).not.toBe(gameScopeKey({ kind: "global", filterKeywords: [] }));
  });
  it("attributes L1 only when every topic has the same unambiguous category/L1", () => {
    expect(gameContextId("survival", { kind: "topics", topics: ["languages/french/core", "languages/french/travel"] })).toBe("survival:category:languages:french");
    expect(gameContextId("survival", { kind: "topics", topics: ["languages/french", "history"] })).toBe("survival:topics");
  });
});
