import { describe, expect, it } from "vitest";
import { getStudyScopeKeywords } from "./studyScopeParams";

describe("getStudyScopeKeywords", () => {
  it("separates navigation keywords from extra filters when nav is present", () => {
    const searchParams = new URLSearchParams(
      "nav=act,math&keywords=act,math,algebra"
    );

    expect(getStudyScopeKeywords(searchParams, true)).toEqual({
      keywords: ["act", "math", "algebra"],
      navigationKeywords: ["act", "math"],
      filterKeywords: ["algebra"],
    });
  });

  it("treats an explicit empty nav param as a root category scope", () => {
    const searchParams = new URLSearchParams("nav=&keywords=algebra");

    expect(getStudyScopeKeywords(searchParams, true)).toEqual({
      keywords: ["algebra"],
      navigationKeywords: [],
      filterKeywords: ["algebra"],
    });
  });

  it("falls back to keywords when legacy category links do not include nav", () => {
    const searchParams = new URLSearchParams("keywords=act,math");

    expect(getStudyScopeKeywords(searchParams, true)).toEqual({
      keywords: ["act", "math"],
      navigationKeywords: ["act", "math"],
      filterKeywords: [],
    });
  });

  it("normalizes nav values with spaces into slug form", () => {
    const searchParams = new URLSearchParams("nav=soccer,world cup");

    expect(getStudyScopeKeywords(searchParams, true)).toEqual({
      keywords: [],
      navigationKeywords: ["soccer", "world-cup"],
      filterKeywords: [],
    });
  });
});
