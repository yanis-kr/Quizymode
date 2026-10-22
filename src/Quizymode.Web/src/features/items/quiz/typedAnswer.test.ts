import { describe, expect, it } from "vitest";
import { gradeTypedAnswer, isTypeable, levenshtein, normalizeTypedText, typoAllowance } from "./typedAnswer";

const right = (typed: string, answer: string): boolean => gradeTypedAnswer(typed, answer).correct;

describe("normalizeTypedText", () => {
  it("ignores case, accents, punctuation and leading articles", () => {
    expect(normalizeTypedText("  The  Café-Bar!! ")).toBe("cafe bar");
    expect(normalizeTypedText("An Apple")).toBe("apple");
    expect(normalizeTypedText("don't")).toBe("dont");
  });

  it("keeps a lone article", () => {
    expect(normalizeTypedText("The")).toBe("the");
  });

  it("strips foreign-phrase markup to the native text", () => {
    expect(normalizeTypedText("{{fr-FR|Bonjour||bon-ZHOOR}}")).toBe("bonjour");
  });
});

describe("isTypeable", () => {
  it("accepts short Latin answers", () => {
    expect(isTypeable({ correctAnswer: "Paris" })).toBe(true);
    expect(isTypeable({ correctAnswer: "The United States" })).toBe(true);
    expect(isTypeable({ correctAnswer: "1945" })).toBe(true);
    expect(isTypeable({ correctAnswer: "{{fr-FR|bonjour||bon-ZHOOR}}" })).toBe(true);
  });

  it("rejects long, empty and non-Latin answers", () => {
    expect(isTypeable({ correctAnswer: "One two three four five" })).toBe(false);
    expect(isTypeable({ correctAnswer: "  " })).toBe(false);
    expect(isTypeable({ correctAnswer: null })).toBe(false);
    expect(isTypeable({ correctAnswer: "{{ru-RU|спасибо|spasibo|spa-SEE-ba}}" })).toBe(false);
    expect(isTypeable({ correctAnswer: "東京" })).toBe(false);
  });
});

describe("gradeTypedAnswer", () => {
  it("grades case, accents, punctuation and articles leniently", () => {
    expect(right("PARIS", "Paris")).toBe(true);
    expect(right("cafe", "Café")).toBe(true);
    expect(right("st. louis", "St Louis")).toBe(true);
    expect(right("hague", "The Hague")).toBe(true);
    expect(right("the hague", "Hague")).toBe(true);
    expect(right("Rome", "Paris")).toBe(false);
  });

  it("accepts any alternate split on slash, or, and parentheses", () => {
    expect(right("colour", "Color / Colour")).toBe(true);
    expect(right("Color", "Color / Colour")).toBe(true);
    expect(right("sagarmatha", "Mount Everest or Sagarmatha")).toBe(true);
    expect(right("Mount Everest", "Mount Everest (Sagarmatha)")).toBe(true);
    expect(right("Mount Everest Sagarmatha", "Mount Everest (Sagarmatha)")).toBe(true);
    expect(right("Sagarmatha", "Mount Everest (Sagarmatha)")).toBe(true);
    expect(right("ac/dc", "AC/DC")).toBe(true);
    expect(right("Lisbon", "Madrid / Lisbon")).toBe(true);
    expect(right("Oslo", "Madrid / Lisbon")).toBe(false);
  });

  it("does not split a separator inside parentheses", () => {
    expect(right("Tokyo", "Edo (now Tokyo/Kanto)")).toBe(false);
    expect(right("Edo", "Edo (now Tokyo/Kanto)")).toBe(true);
  });

  it("tolerates typos by word length", () => {
    expect(typoAllowance("cat")).toBe(0);
    expect(typoAllowance("paris")).toBe(1);
    expect(typoAllowance("jupiter")).toBe(1);
    expect(typoAllowance("mountain")).toBe(2);
    expect(typoAllowance("1946")).toBe(0);
    expect(right("Pariss", "Paris")).toBe(true);
    expect(right("Parss", "Paris")).toBe(true);
    expect(right("Pxrxs", "Paris")).toBe(false);
    expect(right("cet", "cat")).toBe(false);
    expect(right("mountian", "mountain")).toBe(true);
    expect(right("mauntain", "mountain")).toBe(true);
    expect(right("maxntxan", "mountain")).toBe(false);
    expect(right("1946", "1945")).toBe(false);
    expect(right("new yrok city", "New York City")).toBe(false);
    expect(right("new yorkk city", "New York City")).toBe(true);
  });

  it("reports closeness and rejects blanks", () => {
    expect(gradeTypedAnswer("paris", "Paris")).toEqual({ correct: true, closeness: 1 });
    const typo = gradeTypedAnswer("pariss", "Paris");
    expect(typo.correct).toBe(true);
    expect(typo.closeness).toBeLessThan(1);
    const wrong = gradeTypedAnswer("rome", "Paris");
    expect(wrong.correct).toBe(false);
    expect(wrong.closeness).toBeGreaterThanOrEqual(0);
    expect(wrong.closeness).toBeLessThan(0.5);
    expect(gradeTypedAnswer("   ", "Paris")).toEqual({ correct: false, closeness: 0 });
  });

  it("computes edit distance", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
  });
});
