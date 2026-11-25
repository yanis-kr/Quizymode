import { describe, expect, it } from "vitest";
import { minimizePageUrl } from "./feedbackPageUrl";

describe("minimizePageUrl", () => {
  it("keeps an ordinary page URL unchanged", () => {
    expect(minimizePageUrl("https://www.quizymode.com/categories/aws")).toBe(
      "https://www.quizymode.com/categories/aws"
    );
  });

  it("removes the query string and fragment", () => {
    expect(
      minimizePageUrl("https://www.quizymode.com/study/abc?token=synthetic-secret&q=x#frag=synthetic")
    ).toBe("https://www.quizymode.com/study/abc");
  });

  it("keeps the port of a local URL", () => {
    expect(minimizePageUrl("http://localhost:7000/collections?x=1")).toBe("http://localhost:7000/collections");
  });

  it("returns an unparseable value as is", () => {
    expect(minimizePageUrl("not a url")).toBe("not a url");
  });
});
