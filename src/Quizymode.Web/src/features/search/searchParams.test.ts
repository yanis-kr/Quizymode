import { describe, expect, it } from "vitest";
import { buildSearchUrl, parseSearchParams, searchQueryKey, tabSearchTypes } from "./searchParams";

const parse = (query: string, signedIn = false) => parseSearchParams(new URLSearchParams(query), signedIn);

describe("searchQueryKey", () => {
  const base = { q: "latin", typesKey: "items,mine", limit: 5, offset: 0 };

  it("differs per user so cached `mine` titles are never shared (AC 11)", () => {
    const a = searchQueryKey({ ...base, userId: "user-a" });
    const b = searchQueryKey({ ...base, userId: "user-b" });
    const anon = searchQueryKey({ ...base, userId: null });
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(anon);
    expect(anon).toEqual(searchQueryKey({ ...base, userId: null }));
  });
});

describe("parseSearchParams", () => {
  it("defaults to an empty query on the All tab, page 1", () => {
    expect(parse("")).toEqual({ q: "", tab: "all", page: 1 });
  });

  it("reads q, tab and page", () => {
    expect(parse("q=ai&tab=topics&page=3")).toEqual({ q: "ai", tab: "topics", page: 3 });
  });

  it("turns an invalid tab into all and ignores page on the All tab", () => {
    expect(parse("q=ai&tab=bogus&page=4")).toEqual({ q: "ai", tab: "all", page: 1 });
  });

  it("turns mine into all for an anonymous visitor but keeps it when signed in", () => {
    expect(parse("q=ai&tab=mine").tab).toBe("all");
    expect(parse("q=ai&tab=mine", true).tab).toBe("mine");
  });

  it("clamps bad pages to 1 and drops pages past the last reachable offset", () => {
    expect(parse("q=ai&tab=topics&page=0").page).toBe(1);
    expect(parse("q=ai&tab=topics&page=x").page).toBe(1);
    expect(parse("q=ai&tab=topics&page=12").page).toBe(1);
    expect(parse("q=ai&tab=topics&page=11").page).toBe(11);
  });

  it("strips leading whitespace and caps q at 100 characters", () => {
    expect(parse(`q=${"x".repeat(150)}`).q).toHaveLength(100);
    expect(parse("q=%20%20ai").q).toBe("ai");
  });
});

describe("buildSearchUrl", () => {
  it("omits tab and page for the All tab and page 1", () => {
    expect(buildSearchUrl({ q: "ai ml" })).toBe("/search?q=ai+ml");
    expect(buildSearchUrl({ q: "ai", tab: "topics" })).toBe("/search?q=ai&tab=topics");
    expect(buildSearchUrl({ q: "ai", tab: "topics", page: 2 })).toBe("/search?q=ai&tab=topics&page=2");
    expect(buildSearchUrl({ q: "ai", tab: "all", page: 2 })).toBe("/search?q=ai");
  });
});

describe("tabSearchTypes", () => {
  it("maps tabs to API types and only asks for mine when signed in", () => {
    expect(tabSearchTypes("topics", false)).toEqual(["categories", "subcategories"]);
    expect(tabSearchTypes("questions", false)).toEqual(["items"]);
    expect(tabSearchTypes("all", false)).not.toContain("mine");
    expect(tabSearchTypes("all", true)).toContain("mine");
  });
});
