import { describe, expect, it } from "vitest";
import type { FeaturedSetDto } from "@/api/featured";
import {
  CATEGORY_FALLBACK_ID_PREFIX,
  rankPersonalizedHome,
  type ActivityRun,
  type PersonalizationInput,
} from "./personalization";

function set(id: string, categorySlug: string, sortOrder: number, nav1: string | null = null, nav2: string | null = null): FeaturedSetDto {
  return { id, displayName: id, categorySlug, navKeyword1: nav1, navKeyword2: nav2, itemCount: 10, lastModifiedAt: null, sortOrder };
}

function categoryRun(slug: string, completedAt: string, nav: string[] = []): ActivityRun {
  return { completedAt, source: { kind: "category", categorySlug: slug, navigationKeywords: nav, filterKeywords: [] } };
}

const known = ["exams", "trivia", "history", "geography", "tech", "science"];

function input(overrides: Partial<PersonalizationInput>): PersonalizationInput {
  return { explicitInterests: [], runs: [], featuredSets: [], popularCategories: [], knownCategories: known, ...overrides };
}

describe("rankPersonalizedHome", () => {
  it("cold start uses popular categories, then fills from the featured catalog", () => {
    const result = rankPersonalizedHome(
      input({
        popularCategories: ["history", "unknown"],
        featuredSets: [set("t1", "trivia", 1), set("h1", "history", 5), set("h2", "history", 6), set("h3", "history", 7)],
      }),
    );

    expect(result.isColdStart).toBe(true);
    expect(result.forYou).toEqual([]);
    expect(result.recommended.map((s) => s.id)).toEqual(["h1", "h2", "t1", "h3"]);
  });

  it("ranks explicit interests before inferred ones and caps For you at 5", () => {
    const result = rankPersonalizedHome(
      input({
        explicitInterests: ["tech", "trivia", "not-a-category"],
        runs: [
          categoryRun("history", "2026-10-10T10:00:00Z"),
          categoryRun("trivia", "2026-10-12T10:00:00Z"),
          categoryRun("science", "2026-10-15T10:00:00Z"),
          categoryRun("exams", "2026-10-14T10:00:00Z"),
          categoryRun("geography", "2026-10-01T10:00:00Z"),
        ],
      }),
    );

    expect(result.forYou).toEqual([
      { slug: "tech", reason: "explicit" },
      { slug: "trivia", reason: "explicit" },
      { slug: "science", reason: "inferred" },
      { slug: "exams", reason: "inferred" },
      { slug: "history", reason: "inferred" },
    ]);
  });

  it("skips attempted sets and keeps at most 2 per category in the first 5", () => {
    const result = rankPersonalizedHome(
      input({
        explicitInterests: ["trivia", "history"],
        runs: [categoryRun("trivia", "2026-10-12T10:00:00Z", ["sports"])],
        featuredSets: [
          set("t-sports", "trivia", 1, "sports"),
          set("t1", "trivia", 2, "music"),
          set("t2", "trivia", 3, "film"),
          set("t3", "trivia", 4, "art"),
          set("h1", "history", 5, "rome"),
          set("g1", "geography", 6, "europe"),
        ],
      }),
    );

    expect(result.isColdStart).toBe(false);
    expect(result.recommended.map((s) => s.id)).toEqual(["t1", "t2", "h1", "t3"]);
  });

  it("gives a chosen category with no featured set one Explore card in its rank position (#220)", () => {
    const result = rankPersonalizedHome(
      input({
        explicitInterests: ["geography", "science"],
        featuredSets: [set("s1", "science", 1, "solar-system"), set("t1", "trivia", 2)],
        categoryNames: new Map([["geography", "Geography"]]),
      }),
    );

    expect(result.recommended.map((s) => s.id)).toEqual([`${CATEGORY_FALLBACK_ID_PREFIX}geography`, "s1"]);
    const fallback = result.recommended[0];
    expect(fallback.displayName).toBe("Explore Geography");
    expect(fallback.categorySlug).toBe("geography");
    expect([fallback.navKeyword1, fallback.navKeyword2]).toEqual([null, null]);
  });

  it("falls back to the category card when every featured set in it was already attempted", () => {
    const result = rankPersonalizedHome(
      input({
        explicitInterests: ["history"],
        runs: [categoryRun("history", "2026-10-12T10:00:00Z", ["rome"])],
        featuredSets: [set("h1", "history", 1, "rome"), set("t1", "trivia", 2)],
      }),
    );

    expect(result.recommended.map((s) => s.id)).toEqual([`${CATEGORY_FALLBACK_ID_PREFIX}history`, "t1"]);
    expect(result.recommended[0].displayName).toBe("Explore history");
  });

  it("returns distinct Continue sources newest first, at most 3, ignoring runs without a source", () => {
    const result = rankPersonalizedHome(
      input({
        runs: [
          categoryRun("trivia", "2026-10-10T10:00:00Z"),
          { completedAt: "2026-10-16T10:00:00Z", source: null },
          categoryRun("trivia", "2026-10-15T10:00:00Z"),
          { completedAt: "2026-10-14T10:00:00Z", source: { kind: "collection", collectionId: "8f9b8c14-8d30-4d94-9b20-4c7bb7f7f511" } },
          categoryRun("history", "2026-10-13T10:00:00Z"),
          categoryRun("exams", "2026-10-01T10:00:00Z"),
        ],
      }),
    );

    expect(result.continueRuns.map((run) => run.completedAt)).toEqual([
      "2026-10-15T10:00:00Z",
      "2026-10-14T10:00:00Z",
      "2026-10-13T10:00:00Z",
    ]);
  });
});
