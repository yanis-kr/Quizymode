import { describe, expect, it } from "vitest";
import { categoryDisplayName } from "./categorySlug";

describe("categoryDisplayName (#650)", () => {
  it("title-cases a slug", () => {
    expect(categoryDisplayName("trivia")).toBe("Trivia");
    expect(categoryDisplayName("act-math")).toBe("Act Math");
  });

  it("keeps a stored name that already has capitals", () => {
    expect(categoryDisplayName("Trivia")).toBe("Trivia");
    expect(categoryDisplayName("AWS Certs")).toBe("AWS Certs");
  });
});
