import { describe, expect, it } from "vitest";
import { buildActiveFilterChips, removeActiveFilterChip } from "./activeFilterChips";

describe("activeFilterChips (#664)", () => {
  const path = ["german", "idioms"];
  const tags = ["funny"];

  it("AC 3.5.8 returns nav chips then tag chips and nothing for empty input", () => {
    expect(buildActiveFilterChips(path, tags).map((c) => `${c.kind}:${c.keyword}`)).toEqual([
      "nav:german",
      "nav:idioms",
      "tag:funny",
    ]);
    expect(buildActiveFilterChips([], [])).toEqual([]);
  });

  it("AC 3.5.8 drops a tag equal to a path keyword, case-insensitively", () => {
    const chips = buildActiveFilterChips(path, ["Idioms", "Funny", "funny"]);
    expect(chips.map((c) => c.keyword)).toEqual(["german", "idioms", "Funny"]);
  });

  it("AC 3.5.9 removing a nav chip keeps the earlier path and demotes later keywords to tags", () => {
    const chips = buildActiveFilterChips(path, tags);
    expect(removeActiveFilterChip(path, tags, chips[0])).toEqual({
      pathKeywords: [],
      tagKeywords: ["idioms", "funny"],
    });
    expect(removeActiveFilterChip(path, tags, chips[1])).toEqual({
      pathKeywords: ["german"],
      tagKeywords: ["funny"],
    });
  });

  it("AC 3.5.9 removing a tag chip drops it", () => {
    const chips = buildActiveFilterChips(path, tags);
    expect(removeActiveFilterChip(path, tags, chips[2])).toEqual({ pathKeywords: path, tagKeywords: [] });
  });
});
