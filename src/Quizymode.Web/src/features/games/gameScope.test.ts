import { describe, expect, it } from "vitest";
import { buildGamePath, gameContextId, gameScopeKey, type GameScope } from "./gameScope";

const collection: GameScope = {
  kind: "collection",
  collectionId: "11111111-1111-4111-8111-111111111111",
  collectionName: "Practice Set",
};
const category: GameScope = {
  kind: "category",
  category: "Science",
  navigationKeywords: ["physics"],
  filterKeywords: ["optics"],
  search: "?nav=physics&keywords=optics",
};
const global: GameScope = { kind: "global", filterKeywords: [] };

describe("buildGamePath", () => {
  it("builds hub and game paths for each scope", () => {
    expect(buildGamePath(collection)).toBe("/games/collections/11111111-1111-4111-8111-111111111111/practice+set");
    expect(buildGamePath(collection, "match-race")).toBe(
      "/games/match-race/collections/11111111-1111-4111-8111-111111111111/practice+set",
    );
    expect(buildGamePath(category)).toBe("/games/science?nav=physics&keywords=optics");
    expect(buildGamePath(category, "match-race")).toBe("/games/match-race/science?nav=physics&keywords=optics");
    expect(buildGamePath(global)).toBe("/games");
    expect(buildGamePath(global, "match-race")).toBe("/games/match-race");
  });
});

describe("gameScopeKey", () => {
  it("separates scopes and keywords", () => {
    expect(gameScopeKey(collection)).toBe("collection:11111111-1111-4111-8111-111111111111");
    expect(gameScopeKey(category)).not.toBe(gameScopeKey({ ...category, filterKeywords: [] }));
    expect(gameScopeKey(global)).toBe("global|kw=");
  });
});

describe("gameContextId", () => {
  it("uses the documented formats", () => {
    expect(gameContextId("match-race", collection)).toBe("match-race:collection:11111111-1111-4111-8111-111111111111");
    expect(gameContextId("match-race", category)).toBe("match-race:category:science");
    expect(gameContextId("match-race", global)).toBe("match-race:global");
  });
});
