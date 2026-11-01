import { describe, expect, it } from "vitest";
import { sanitizeInAppPath } from "./safeInAppPath";

describe("sanitizeInAppPath", () => {
  it.each([
    ["/quiz/x?a=1#h", "/quiz/x?a=1#h"],
    ["/categories/geo", "/categories/geo"],
    ["/%5Cevil.com", "/%5Cevil.com"],
    ["/", "/"],
    ["/?x", "/?x"],
    ["/#x", "/#x"],
  ])("accepts %s", (raw, expected) => {
    expect(sanitizeInAppPath(raw)).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["//evil.com"],
    ["/\\evil.com"],
    ["\\evil.com"],
    ["https://evil.com"],
    ["javascript:alert(1)"],
    ["/a\nb"],
    ["/a\tb"],
    ["evil.com"],
    [`/${"a".repeat(4096)}`],
  ])("rejects %j", (raw) => {
    expect(sanitizeInAppPath(raw)).toBeNull();
  });

  it("accepts a path at exactly the max length", () => {
    const raw = `/${"a".repeat(4095)}`;
    expect(sanitizeInAppPath(raw)).toBe(raw);
  });
});
