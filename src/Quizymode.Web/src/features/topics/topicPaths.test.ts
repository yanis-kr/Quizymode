import { describe, expect, it } from "vitest";
import type { TaxonomyResponse } from "@/api/taxonomy";
import fixture from "./__fixtures__/taxonomy.fixture.json";
import { buildTopicPaths, filterTopicPaths, topicPathKey } from "./topicPaths";

const taxonomy = fixture as TaxonomyResponse;
const paths = buildTopicPaths(taxonomy);

const small: TaxonomyResponse = {
  categories: [
    {
      slug: "exams",
      name: "exams",
      description: "Exam prep",
      itemCount: 0,
      allKeywordSlugs: [],
      groups: [
        {
          slug: "aws",
          description: "AWS certs",
          itemCount: 0,
          keywords: [
            { slug: "saa-c03", description: "Arch associate", itemCount: 0 },
            { slug: "ccp", description: "Cloud basics", itemCount: 0 },
          ],
        },
        {
          slug: "azure",
          description: "Azure certs",
          itemCount: 0,
          keywords: [{ slug: "az-900", description: "Fundamentals", itemCount: 0 }],
        },
      ],
    },
    {
      slug: "tech",
      name: "tech",
      description: "Technology",
      itemCount: 0,
      allKeywordSlugs: [],
      groups: [
        {
          slug: "ai-ml",
          description: "AI and ML",
          itemCount: 0,
          keywords: [
            { slug: "deep-learning", description: "Neural nets", itemCount: 0 },
            { slug: "learning-theory", description: "Theory", itemCount: 0 },
          ],
        },
      ],
    },
  ],
};
const smallPaths = buildTopicPaths(small);

describe("buildTopicPaths", () => {
  it("builds exactly one entry per L2 of the committed taxonomy fixture", () => {
    expect(paths).toHaveLength(1108);
    expect(new Set(paths.map(topicPathKey)).size).toBe(1108);
  });

  it("returns no paths without a taxonomy", () => {
    expect(buildTopicPaths(undefined)).toEqual([]);
  });
});

describe("filterTopicPaths", () => {
  it("finds every L2 of the taxonomy by its own slug (3 or more characters)", () => {
    // AC 12.15: the cap is lifted here because common slugs such as "basics" exist under many topics.
    for (const path of paths) {
      if (path.l2.length < 3) continue;
      const found = filterTopicPaths(paths, path.l2, Infinity).groups.flatMap((group) => group.paths);
      expect(found.map(topicPathKey), `${path.category} > ${path.l1} > ${path.l2}`).toContain(topicPathKey(path));
    }
  });

  it("finds every L2 by its L1 slug followed by its own slug within the default cap", () => {
    // AC 12.15
    for (const path of paths) {
      if (path.l2.length < 3) continue;
      const result = filterTopicPaths(paths, `${path.l1} ${path.l2}`);
      const found = result.groups.flatMap((group) => group.paths).map(topicPathKey);
      expect(found, `${path.l1} ${path.l2}`).toContain(topicPathKey(path));
    }
  });

  it("finds a path from a partial L2 slug after the L1 (aws saa)", () => {
    const result = filterTopicPaths(smallPaths, "aws saa");
    expect(result.groups.flatMap((g) => g.paths).map(topicPathKey)).toEqual(["exams/aws/saa-c03"]);
  });

  it("ranks an exact word above a prefix above a substring", () => {
    const set = buildTopicPaths({
      categories: [
        {
          slug: "tech",
          name: "tech",
          description: null,
          itemCount: 0,
          allKeywordSlugs: [],
          groups: [
            {
              slug: "web",
              description: null,
              itemCount: 0,
              keywords: [
                { slug: "subnetting", description: null, itemCount: 0 },
                { slug: "netmask", description: null, itemCount: 0 },
                { slug: "net", description: null, itemCount: 0 },
              ],
            },
          ],
        },
      ],
    });
    const order = filterTopicPaths(set, "net").groups.flatMap((g) => g.paths.map((p) => p.l2));
    expect(order).toEqual(["net", "netmask", "subnetting"]);
  });

  it("requires every word to match", () => {
    expect(filterTopicPaths(smallPaths, "aws neural").groups).toHaveLength(0);
    expect(filterTopicPaths(smallPaths, "deep learning").groups.flatMap((g) => g.paths).map((p) => p.l2)).toEqual([
      "deep-learning",
    ]);
  });

  it("matches the description", () => {
    const found = filterTopicPaths(smallPaths, "neural").groups.flatMap((g) => g.paths).map(topicPathKey);
    expect(found).toEqual(["tech/ai-ml/deep-learning"]);
  });

  it("tolerates one typo only for words of 4 or more characters", () => {
    expect(filterTopicPaths(smallPaths, "learnign").groups.flatMap((g) => g.paths).length).toBeGreaterThan(0);
    expect(filterTopicPaths(smallPaths, "ccq").groups).toHaveLength(0);
  });

  it("shows nothing below 2 characters", () => {
    expect(filterTopicPaths(smallPaths, "a").groups).toEqual([]);
    expect(filterTopicPaths(smallPaths, "  ").groups).toEqual([]);
  });

  it("caps the options at 50, flags the overflow and groups them by category", () => {
    const result = filterTopicPaths(paths, "ai");
    expect(result.shown).toBe(50);
    expect(result.overflow).toBe(true);
    expect(result.groups.flatMap((g) => g.paths)).toHaveLength(50);
    for (const group of result.groups) {
      expect(group.paths.every((p) => p.category === group.category)).toBe(true);
    }
    expect(new Set(result.groups.map((g) => g.category)).size).toBe(result.groups.length);
  });

  it("does not flag the overflow when everything fits", () => {
    const result = filterTopicPaths(smallPaths, "learning");
    expect(result.overflow).toBe(false);
    expect(result.tokens).toEqual(["learning"]);
  });
});
