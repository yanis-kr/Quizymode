import { describe, expect, it } from "vitest";
import { getCompactCollectionLabel } from "./ItemCollectionControls";

describe("getCompactCollectionLabel", () => {
  it("reduces a multi-word collection name to a 3-letter mobile label", () => {
    expect(getCompactCollectionLabel("Second collection")).toBe("Sec");
  });

  it("strips punctuation before abbreviating", () => {
    expect(getCompactCollectionLabel("Te's Collection")).toBe("Tes");
  });
});
