import { describe, expect, it } from "vitest";
import { buildGamePath, gameScopeSearch } from "./gameScope";

describe("gameScopeSearch (#768)", () => {
  it("carries nav and keywords when the quiz URL had both", () => {
    const search = gameScopeSearch({ hasExplicitNav: true, navigationKeywords: ["aws", "saa-c03"], keywords: ["aws", "saa-c03"] });
    expect(search).toBe("?nav=aws,saa-c03&keywords=aws,saa-c03");
  });

  it("carries nav alone when the quiz URL had nav and no keywords", () => {
    expect(gameScopeSearch({ hasExplicitNav: true, navigationKeywords: ["aws", "saa-c03"], keywords: [] })).toBe("?nav=aws,saa-c03");
  });

  it("keeps a keywords-only link without a nav parameter", () => {
    expect(gameScopeSearch({ hasExplicitNav: false, navigationKeywords: ["x"], keywords: ["x"] })).toBe("?keywords=x");
  });

  it("returns no query when there is no nav and no keywords", () => {
    expect(gameScopeSearch({ hasExplicitNav: false, navigationKeywords: [], keywords: [] })).toBe("");
  });

  it("builds /games/exams?nav=... for the category scope", () => {
    const path = buildGamePath({
      kind: "category",
      category: "exams",
      navigationKeywords: ["aws", "saa-c03"],
      filterKeywords: [],
      search: gameScopeSearch({ hasExplicitNav: true, navigationKeywords: ["aws", "saa-c03"], keywords: [] }),
    });
    expect(path).toBe("/games/exams?nav=aws,saa-c03");
  });
});
