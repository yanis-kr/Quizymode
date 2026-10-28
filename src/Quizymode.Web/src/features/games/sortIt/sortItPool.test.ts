import { describe, expect, it } from "vitest";
import type { ItemResponse } from "@/types/api";
import { buildSortItGroups, hasSortableSet, pickSortItGroups } from "./sortItPool";

let counter = 0;
function make(groupLabel: string | null | undefined, answer: string, overrides: Partial<ItemResponse> = {}): ItemResponse {
  counter += 1;
  return {
    id: `id-${counter}`,
    category: "science",
    isPrivate: false,
    question: `A very long question that is never shown to the player, number ${counter}, ${"x".repeat(120)}`,
    correctAnswer: answer,
    incorrectAnswers: [],
    explanation: "",
    createdAt: "2026-03-22T00:00:00Z",
    keywords: [],
    collections: [],
    groupLabel,
    ...overrides,
  };
}

function group(label: string, prefix: string, count = 4, overrides: Partial<ItemResponse> = {}): ItemResponse[] {
  return Array.from({ length: count }, (_, index) => make(label, `${prefix}${index + 1}`, overrides));
}

describe("buildSortItGroups", () => {
  it("builds groups from 4 items each and ignores question length and distractors", () => {
    const groups = buildSortItGroups([...group("Mammals", "m"), ...group("Birds", "b")]);
    expect(groups.map((g) => g.label)).toEqual(["Mammals", "Birds"]);
    expect(groups.every((g) => g.items.length === 4)).toBe(true);
  });

  it("needs at least two groups of four", () => {
    expect(buildSortItGroups(group("Mammals", "m"))).toEqual([]);
    expect(buildSortItGroups([...group("Mammals", "m"), ...group("Birds", "b", 3)])).toEqual([]);
    expect(hasSortableSet([...group("Mammals", "m"), ...group("Birds", "b", 3)])).toBe(false);
    expect(hasSortableSet([...group("Mammals", "m"), ...group("Birds", "b")])).toBe(true);
  });

  it("drops a group below four but keeps the others when two or more qualify", () => {
    const groups = buildSortItGroups([...group("A", "a"), ...group("B", "b"), ...group("C", "c", 3)]);
    expect(groups.map((g) => g.label)).toEqual(["A", "B"]);
  });

  it("keys groups by trimmed, whitespace-collapsed, lowercase label and shows the first spelling", () => {
    const items = [
      make(" Big Cats ", "a1"),
      make("big   cats", "a2"),
      make("BIG CATS", "a3"),
      make("Big cats", "a4"),
      ...group("Birds", "b"),
    ];
    const groups = buildSortItGroups(items);
    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe("Big Cats");
    expect(groups[0].items).toHaveLength(4);
  });

  it("ignores blank, missing and over-long labels and empty or long answers", () => {
    const items = [
      ...group("A", "a"),
      ...group("B", "b"),
      make(null, "x1"),
      make("   ", "x2"),
      make(undefined, "x3"),
      make("L".repeat(31), "x4"),
      make("A", ""),
      make("A", "   "),
      make("A", "y".repeat(26)),
    ];
    const groups = buildSortItGroups(items);
    expect(groups.map((g) => g.items.length)).toEqual([4, 4]);
  });

  it("accepts a 30 character label and a 25 character answer", () => {
    const items = [
      ...Array.from({ length: 4 }, (_, i) => make("L".repeat(30), `${"a".repeat(24)}${i}`)),
      ...group("B", "b"),
    ];
    expect(buildSortItGroups(items)).toHaveLength(2);
  });

  it("dedupes by id and, within a group, by answer, keeping the first", () => {
    const first = make("A", "a1");
    const items = [
      first,
      { ...first },
      make("A", " A1 "),
      make("A", "a2"),
      make("A", "a3"),
      make("A", "a4"),
      ...group("B", "b"),
    ];
    const groups = buildSortItGroups(items);
    expect(groups[0].items.map((i) => i.correctAnswer)).toEqual(["a1", "a2", "a3", "a4"]);
  });

  it("does not dedupe questions", () => {
    const items = [...group("A", "a", 4, { question: "same" }), ...group("B", "b", 4, { question: "same" })];
    expect(buildSortItGroups(items)).toHaveLength(2);
  });

  it("drops an answer that appears in more than one group, from both groups", () => {
    const items = [...group("A", "a"), make("A", "shared"), ...group("B", "b"), make("B", "Shared")];
    const groups = buildSortItGroups(items);
    const answers = groups.flatMap((g) => g.items.map((i) => i.correctAnswer));
    expect(answers).not.toContain("shared");
    expect(answers).not.toContain("Shared");
    expect(groups).toHaveLength(2);
  });

  it("empties the scope when a cross-group drop takes a group from 4 to 3", () => {
    const items = [
      make("A", "a1"),
      make("A", "a2"),
      make("A", "a3"),
      make("A", "shared"),
      ...group("B", "b"),
      make("C", "shared"),
    ];
    // A has 4 items before the drop and 3 after; C never had 4; only B qualifies.
    expect(buildSortItGroups(items)).toEqual([]);
  });

  it("drops an answer equal to any group label", () => {
    const items = [...group("A", "a"), make("A", "birds"), ...group("Birds", "b")];
    const groups = buildSortItGroups(items);
    expect(groups.find((g) => g.label === "A")?.items).toHaveLength(4);
  });
});

describe("pickSortItGroups", () => {
  const six = ["A", "B", "C", "D", "E", "F"].flatMap((label) => group(label, label.toLowerCase()));

  it("keeps up to 4 groups as they are", () => {
    const groups = buildSortItGroups([...group("A", "a"), ...group("B", "b")]);
    expect(pickSortItGroups(groups, "run").map((g) => g.label)).toEqual(["A", "B"]);
  });

  it("picks 4 of more than 4, the same for one run id", () => {
    const groups = buildSortItGroups(six);
    expect(groups).toHaveLength(6);
    const one = pickSortItGroups(groups, "run-1").map((g) => g.label);
    expect(one).toHaveLength(4);
    expect(new Set(one).size).toBe(4);
    expect(pickSortItGroups(groups, "run-1").map((g) => g.label)).toEqual(one);
  });

  it("can pick different groups for different runs", () => {
    const groups = buildSortItGroups(six);
    const picks = new Set(Array.from({ length: 12 }, (_, i) => pickSortItGroups(groups, `run-${i}`).map((g) => g.label).sort().join()));
    expect(picks.size).toBeGreaterThan(1);
  });
});
