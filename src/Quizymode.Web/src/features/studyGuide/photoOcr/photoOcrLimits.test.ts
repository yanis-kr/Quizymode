import { describe, expect, it } from "vitest";
import { PHOTO_OCR_LIMITS, validatePhotoSelection } from "./photoOcrLimits";

function photo(name: string, bytes = 1000, type = "image/jpeg"): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: bytes });
  return file;
}

describe("validatePhotoSelection (AC 6.6.45)", () => {
  it("accepts up to 20 JPEG and PNG photos", () => {
    const files = Array.from({ length: PHOTO_OCR_LIMITS.maxImages }, (_, index) => photo(`p${index}.jpg`));
    expect(validatePhotoSelection(files)).toBeNull();
    expect(validatePhotoSelection([photo("a.png", 1000, "image/png")])).toBeNull();
  });

  it("rejects a 21st photo before any is read", () => {
    const files = Array.from({ length: PHOTO_OCR_LIMITS.maxImages + 1 }, (_, index) => photo(`p${index}.jpg`));
    expect(validatePhotoSelection(files)).toBe("Choose up to 20 photos at a time. You chose 21.");
  });

  it("names a photo over 10 MB", () => {
    expect(validatePhotoSelection([photo("big.jpg", 10 * 1024 * 1024 + 1)])).toBe(
      "big.jpg is over 10 MB. Choose a smaller photo."
    );
  });

  it("rejects a file that is not a JPEG or PNG photo", () => {
    expect(validatePhotoSelection([photo("notes.pdf", 1000, "application/pdf")])).toBe(
      "notes.pdf is not a JPEG or PNG photo. Only JPEG and PNG photos are supported."
    );
  });

  it("asks for at least one photo", () => {
    expect(validatePhotoSelection([])).toBe("Choose at least one photo.");
  });
});
