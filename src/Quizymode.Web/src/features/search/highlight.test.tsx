import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HighlightedText from "./HighlightedText";
import { queryTokens, segmentByRanges, segmentByTokens } from "./highlight";

describe("queryTokens", () => {
  it("lower-cases, splits on punctuation, drops one-letter words and duplicates, longest first", () => {
    expect(queryTokens("Artificial, intelligence! a AI ai")).toEqual(["intelligence", "artificial", "ai"]);
  });

  it("keeps non-ASCII words", () => {
    expect(queryTokens("café 日本")).toEqual(["café", "日本"]);
  });
});

describe("segmentByRanges", () => {
  it("splits on server ranges", () => {
    expect(segmentByRanges("What is a neural network?", [{ start: 10, length: 6 }])).toEqual([
      { text: "What is a ", match: false },
      { text: "neural", match: true },
      { text: " network?", match: false },
    ]);
  });

  it("uses UTF-16 offsets, so a surrogate pair before the match counts as two units", () => {
    const text = "😀 AI basics";
    // The emoji is two UTF-16 units, then a space: "AI" starts at index 3.
    expect(segmentByRanges(text, [{ start: 3, length: 2 }]).filter((s) => s.match)).toEqual([
      { text: "AI", match: true },
    ]);
  });

  it("ignores overlapping, empty and out-of-range ranges and clips to the text", () => {
    const segments = segmentByRanges("abcdef", [
      { start: 0, length: 3 },
      { start: 1, length: 2 },
      { start: 4, length: 0 },
      { start: 5, length: 40 },
      { start: 99, length: 2 },
    ]);
    expect(segments.map((s) => s.text).join("")).toBe("abcdef");
    expect(segments.filter((s) => s.match).map((s) => s.text)).toEqual(["abc", "f"]);
  });
});

describe("segmentByTokens", () => {
  it("highlights only the start of words that begin with a token", () => {
    const matches = segmentByTokens("Main AI Introduction", ["ai", "intro"])
      .filter((s) => s.match)
      .map((s) => s.text);
    expect(matches).toEqual(["AI", "Intro"]);
  });

  it("returns the text untouched without tokens", () => {
    expect(segmentByTokens("tech", [])).toEqual([{ text: "tech", match: false }]);
  });
});

describe("HighlightedText", () => {
  it("renders markup inside a snippet as text, never as HTML", () => {
    const text = '<img src=x onerror="alert(1)"> hello';
    const { container } = render(<HighlightedText text={text} ranges={[{ start: 31, length: 5 }]} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe(text);
    expect(container.querySelector("mark")?.textContent).toBe("hello");
  });

  it("renders markup inside a title as text", () => {
    const { container } = render(<HighlightedText text={"<img onerror=alert(1)> AI"} tokens={["ai"]} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("<img onerror=alert(1)> AI");
  });
});
