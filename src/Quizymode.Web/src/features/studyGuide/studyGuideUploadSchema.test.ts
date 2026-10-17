import { describe, expect, it } from "vitest";
import {
  STUDY_GUIDE_UPLOAD_MAX_BYTES,
  parseKeywordsInput,
  utf8ByteLength,
  validateStudyGuideUploadForm,
} from "./studyGuideUploadSchema";

const valid = {
  text: "Photosynthesis converts light into chemical energy.",
  category: "science",
  navigationKeyword1: "biology",
  navigationKeyword2: "plants",
  keywords: ["chapter-1"],
};

describe("studyGuideUploadSchema", () => {
  it("accepts a valid form", () => {
    expect(validateStudyGuideUploadForm(valid)).toBeNull();
  });

  it("requires text and topic fields", () => {
    expect(validateStudyGuideUploadForm({ ...valid, text: "   " })).toMatch(/paste/i);
    expect(validateStudyGuideUploadForm({ ...valid, category: "" })).toMatch(/category/i);
    expect(validateStudyGuideUploadForm({ ...valid, navigationKeyword2: "" })).toMatch(/subtopic/i);
  });

  it("measures the 10 KB limit in UTF-8 bytes", () => {
    expect(utf8ByteLength("é")).toBe(2);
    expect(
      validateStudyGuideUploadForm({ ...valid, text: "a".repeat(STUDY_GUIDE_UPLOAD_MAX_BYTES) })
    ).toBeNull();
    expect(validateStudyGuideUploadForm({ ...valid, text: "é".repeat(5121) })).toMatch(/10 KB/);
  });

  it("validates keywords", () => {
    expect(parseKeywordsInput(" exam prep , ,chapter-1")).toEqual(["exam-prep", "chapter-1"]);
    expect(validateStudyGuideUploadForm({ ...valid, keywords: ["bad!"] })).toMatch(/letters/i);
    expect(
      validateStudyGuideUploadForm({
        ...valid,
        keywords: Array.from({ length: 11 }, (_, i) => `k${i}`),
      })
    ).toMatch(/at most 10/i);
  });
});
