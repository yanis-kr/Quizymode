import { describe, expect, it } from "vitest";
import { resolveLegalLinkTarget } from "./legalLinkTarget";

describe("resolveLegalLinkTarget (#811)", () => {
  it.each(["/privacy", "/terms#section", "/items?x=1", "relative/page", "#top", "./sibling"])(
    "allows the relative path %s",
    (href) => {
      expect(resolveLegalLinkTarget(href)).toEqual({ kind: "internal", to: href });
    },
  );

  it("allows https", () => {
    expect(resolveLegalLinkTarget("https://example.com/policy")).toEqual({ kind: "https", href: "https://example.com/policy" });
    expect(resolveLegalLinkTarget("HTTPS://example.com/")).toEqual({ kind: "https", href: "https://example.com/" });
  });

  it("allows mailto", () => {
    expect(resolveLegalLinkTarget("mailto:privacy@example.com")).toEqual({ kind: "mailto", href: "mailto:privacy@example.com" });
    expect(resolveLegalLinkTarget("MAILTO:privacy@example.com")).toEqual({ kind: "mailto", href: "MAILTO:privacy@example.com" });
  });

  it.each([
    ["javascript", "javascript:alert(1)"],
    ["javascript in mixed case", "JaVaScRiPt:alert(1)"],
    ["javascript with an embedded tab", "java\tscript:alert(1)"],
    ["javascript with a leading space", " javascript:alert(1)"],
    ["data", "data:text/html,<script>alert(1)</script>"],
    ["vbscript", "vbscript:msgbox(1)"],
    ["file", "file:///etc/passwd"],
    ["plain http", "http://example.com/"],
    ["ftp", "ftp://example.com/"],
    ["a custom scheme", "myapp://open"],
    ["protocol-relative", "//evil.example/path"],
    ["backslash protocol-relative", "/\\evil.example"],
    ["an https url with credentials", "https://user:pw@example.com/"],
    ["https with no authority", "https:"],
    ["a bare mailto", "mailto:"],
    ["an empty href", ""],
    ["a whitespace-only href", "   "],
  ])("refuses %s", (_name, href) => {
    expect(resolveLegalLinkTarget(href)).toBeNull();
  });
});
