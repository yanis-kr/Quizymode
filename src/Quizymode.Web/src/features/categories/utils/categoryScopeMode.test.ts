import { describe, expect, it } from "vitest";
import { getCategoryScopeModeConfig } from "./categoryScopeMode";

describe("getCategoryScopeModeConfig", () => {
  it("forces list mode and hides sets when the scope is a leaf", () => {
    const result = getCategoryScopeModeConfig("sets", true);

    expect(result.activeView).toBe("items");
    expect(result.availableModes).toEqual(["list", "explore", "quiz"]);
  });

  it("keeps sets available for non-leaf scopes", () => {
    const result = getCategoryScopeModeConfig("sets", false);

    expect(result.activeView).toBe("sets");
    expect(result.availableModes).toEqual([
      "sets",
      "list",
      "explore",
      "quiz",
    ]);
  });
});
