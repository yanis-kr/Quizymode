import { describe, expect, it } from "vitest";
import { promotedScopeDescription } from "./promotedScopes";

describe("promotedScopeDescription (#714)", () => {
  it("returns the one-sentence description for SAA-C03", () => {
    expect(promotedScopeDescription("exams/aws/saa-c03")).toBe(
      "Practice questions for the AWS Certified Solutions Architect Associate exam (SAA-C03).",
    );
  });

  it("returns null for a scope that is not promoted, including inherited object keys", () => {
    expect(promotedScopeDescription("exams/aws")).toBeNull();
    expect(promotedScopeDescription("constructor")).toBeNull();
  });
});
