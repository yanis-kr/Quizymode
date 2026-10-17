import { describe, expect, it } from "vitest";
import { getAllowedStatusTransitions, STATUS_ORDER } from "./ideaBoard";

describe("getAllowedStatusTransitions", () => {
  it("never allows a status to transition to itself", () => {
    for (const status of STATUS_ORDER) {
      expect(getAllowedStatusTransitions(status)).not.toContain(status);
    }
  });

  it("blocks jumping straight to Shipped from Proposed", () => {
    expect(getAllowedStatusTransitions("Proposed")).not.toContain("Shipped");
  });

  it("only lets Archived ideas be restored to Proposed", () => {
    expect(getAllowedStatusTransitions("Archived")).toEqual(["Proposed"]);
  });

  it("only lets Shipped ideas be archived", () => {
    expect(getAllowedStatusTransitions("Shipped")).toEqual(["Archived"]);
  });
});
