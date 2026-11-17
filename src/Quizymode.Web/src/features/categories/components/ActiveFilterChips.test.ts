import { describe, expect, it } from "vitest";
import { ACTIVE_FILTER_CHIP_CLASS } from "./ActiveFilterChips";

/** Pairs of Tailwind theme tokens that must not be combined: fixed shades fail in dark mode (#707). */
const FORBIDDEN_FIXED_SHADES = [/text-indigo-(?!ink)\d{3}/, /bg-indigo-(?!50|100)\d{3}/];

describe("ActiveFilterChips colour tokens", () => {
  it("uses the indigo surface and ink tokens that stay legible in both themes", () => {
    expect(ACTIVE_FILTER_CHIP_CLASS).toContain("bg-indigo-50");
    expect(ACTIVE_FILTER_CHIP_CLASS).toContain("text-indigo-ink");
  });

  it("does not use fixed shades that resolve to low contrast in dark mode", () => {
    for (const pattern of FORBIDDEN_FIXED_SHADES) {
      expect(ACTIVE_FILTER_CHIP_CLASS).not.toMatch(pattern);
    }
  });

  it("keeps the 44 px touch target", () => {
    expect(ACTIVE_FILTER_CHIP_CLASS).toContain("min-h-[44px]");
  });
});
