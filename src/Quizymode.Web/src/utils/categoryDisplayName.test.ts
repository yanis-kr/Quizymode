import { describe, expect, it } from "vitest";
import { categoryDisplayName, keywordDisplayName } from "./categorySlug";

describe("keywordDisplayName (AC 3.6.4, #713)", () => {
  it("shows acronyms and exam codes in capitals", () => {
    expect(keywordDisplayName("saa-c03")).toBe("SAA-C03");
    expect(keywordDisplayName("aws")).toBe("AWS");
    expect(keywordDisplayName("aws-certs")).toBe("AWS Certs");
  });

  it("title-cases ordinary words and reads other as Others", () => {
    expect(keywordDisplayName("act-math")).toBe("Act Math");
    expect(keywordDisplayName("exams")).toBe("Exams");
    expect(keywordDisplayName("other")).toBe("Others");
  });
});

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
