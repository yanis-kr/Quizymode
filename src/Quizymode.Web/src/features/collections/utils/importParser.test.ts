import { describe, expect, it } from "vitest";
import {
  applyTemplate,
  buildImportItems,
  parseTermPairs,
  pickDeterministic,
  splitRecords,
  stripHtml,
  DEFAULT_PARSE_OPTIONS,
  type TermPair,
} from "./importParser";

const pairsOf = (n: number): TermPair[] =>
  Array.from({ length: n }, (_, i) => ({ term: `term${i}`, definition: `def${i}`, row: i + 1 }));

const build = (pairs: TermPair[], over: Partial<Parameters<typeof buildImportItems>[1]> = {}) =>
  buildImportItems(pairs, { direction: "term-to-definition", template: "{term}", limit: 100, ...over });

describe("parseTermPairs", () => {
  it("parses Quizlet export (term TAB definition per line) and skips blank lines", () => {
    const result = parseTermPairs("cat\tgato\n\ndog\tperro\r\nbird\tpajaro\n");
    expect(result.pairs.map((p) => [p.term, p.definition])).toEqual([
      ["cat", "gato"],
      ["dog", "perro"],
      ["bird", "pajaro"],
    ]);
    expect(result.separatorUsed).toBe("\t");
  });

  it("ignores Anki '#' header lines, strips HTML and ignores extra columns", () => {
    const text = [
      "#separator:tab",
      "#html:true",
      "#tags column:3",
      "<b>Hello</b><br>world\tHola&nbsp;mundo &amp; co\ttag1",
      "<div>one</div>\t<i>uno</i>\t",
    ].join("\n");
    const result = parseTermPairs(text);
    expect(result.pairs.map((p) => [p.term, p.definition])).toEqual([
      ["Hello world", "Hola mundo & co"],
      ["one", "uno"],
    ]);
  });

  it("honours an Anki #separator declaration", () => {
    const result = parseTermPairs("#separator:semicolon\na;b\nc;d");
    expect(result.pairs).toHaveLength(2);
    expect(result.separatorUsed).toBe(";");
  });

  it("does not treat a term that merely starts with # as a header", () => {
    const result = parseTermPairs("#hashtag\tsocial label");
    expect(result.pairs[0].term).toBe("#hashtag");
  });

  it("parses CSV with quoted fields, embedded separators, escaped quotes and newlines", () => {
    const text = 'a,"b, with comma"\n"say ""hi""",x\n"multi\nline",y';
    const result = parseTermPairs(text);
    expect(result.pairs.map((p) => [p.term, p.definition])).toEqual([
      ["a", "b, with comma"],
      ['say "hi"', "x"],
      ["multi line", "y"],
    ]);
  });

  it("treats quotes literally when quote handling is off", () => {
    const result = parseTermPairs('"a",b', { ...DEFAULT_PARSE_OPTIONS, quotes: false });
    expect(result.pairs[0].term).toBe('"a"');
  });

  it("parses TSV and explicit, pipe and custom separators", () => {
    expect(parseTermPairs("a\tb", { ...DEFAULT_PARSE_OPTIONS, separator: "tab" }).pairs[0].definition).toBe("b");
    expect(parseTermPairs("a|b", { ...DEFAULT_PARSE_OPTIONS, separator: "pipe" }).pairs[0].definition).toBe("b");
    expect(parseTermPairs("a;b", { ...DEFAULT_PARSE_OPTIONS, separator: "semicolon" }).pairs[0].definition).toBe("b");
    expect(
      parseTermPairs("a - b, c - d", { ...DEFAULT_PARSE_OPTIONS, separator: "custom", customSeparator: " - " }).pairs
    ).toHaveLength(1);
  });

  it("returns nothing for an empty custom separator", () => {
    const result = parseTermPairs("a,b", { ...DEFAULT_PARSE_OPTIONS, separator: "custom", customSeparator: "" });
    expect(result.pairs).toEqual([]);
  });

  it("reports rows missing a term or definition", () => {
    const result = parseTermPairs("a,b\nonly\n,x\nc,d");
    expect(result.pairs).toHaveLength(2);
    expect(result.skipped.map((s) => s.row)).toEqual([2, 3]);
  });

  it("skips a header row written by the export", () => {
    const result = parseTermPairs("question,correct answer,incorrect answers,explanation\nq,a,b | c,why");
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].row).toBe(1);
  });

  it("strips a leading BOM", () => {
    expect(parseTermPairs("\uFEFFa\tb").pairs[0].term).toBe("a");
  });
});

describe("quote handling and headers", () => {
  it("keeps fields that start with a quote but are not fully quoted (Quizlet/TSV)", () => {
    const result = parseTermPairs('"To be" - who?\t"quoted" ans\ny\tz');
    expect(result.pairs.map((p) => [p.term, p.definition])).toEqual([
      ['"To be" - who?', '"quoted" ans'],
      ["y", "z"],
    ]);
  });

  it("does not let an unbalanced opening quote swallow the rest of the paste", () => {
    const result = parseTermPairs('"open\tx\na\tb\nc\td');
    expect(result.pairs.map((p) => [p.term, p.definition])).toEqual([
      ['"open', "x"],
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("keeps a data row that looks like a header, but ignores real Anki headers before data", () => {
    const text = "#separator:tab\n#html:true\na\tb\n#Note: hi\tstays\n#deck: x\ty";
    const result = parseTermPairs(text);
    expect(result.pairs.map((p) => [p.term, p.definition])).toEqual([
      ["a", "b"],
      ["#Note: hi", "stays"],
      ["#deck: x", "y"],
    ]);
  });

  it("removes the export's formula guard from cells", () => {
    const result = parseTermPairs("'=SUM(1),'-5\n'plain,x");
    expect(result.pairs.map((p) => [p.term, p.definition])).toEqual([
      ["=SUM(1)", "-5"],
      ["'plain", "x"],
    ]);
  });
});

describe("stripHtml and splitRecords", () => {
  it("removes tags, decodes entities and keeps plain angle brackets", () => {
    expect(stripHtml("<b>x</b> &lt;3 &#65; 2 < 3")).toBe("x <3 A 2 < 3");
  });

  it("splits records without quotes", () => {
    expect(splitRecords("a,b\nc,d", ",", false)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

describe("applyTemplate", () => {
  it("replaces {term}, prefixes when absent and defaults to the term", () => {
    expect(applyTemplate("Define: {term}", "cat")).toBe("Define: cat");
    expect(applyTemplate("What is {term}? ({term})", "cat")).toBe("What is cat? (cat)");
    expect(applyTemplate("Define:", "cat")).toBe("Define: cat");
    expect(applyTemplate("  ", "cat")).toBe("cat");
  });
});

describe("buildImportItems", () => {
  it("builds items with up to 3 distinct distractors taken from other answers", () => {
    const result = build(pairsOf(6));
    expect(result.error).toBeNull();
    expect(result.items).toHaveLength(6);
    for (const item of result.items) {
      expect(item.incorrectAnswers).toHaveLength(3);
      expect(item.incorrectAnswers).not.toContain(item.correctAnswer);
      expect(new Set(item.incorrectAnswers).size).toBe(3);
      for (const w of item.incorrectAnswers) expect(w).toMatch(/^def\d$/);
    }
  });

  it("is deterministic", () => {
    expect(build(pairsOf(9))).toEqual(build(pairsOf(9)));
    expect(pickDeterministic(["a", "b", "c", "d", "e"], 3, "seed")).toEqual(
      pickDeterministic(["a", "b", "c", "d", "e"], 3, "seed")
    );
  });

  it("supports the reverse direction and a question template", () => {
    const result = build(pairsOf(4), { direction: "definition-to-term", template: "Which term is {term}?" });
    expect(result.items[0].question).toBe("Which term is def0?");
    expect(result.items[0].correctAnswer).toBe("term0");
    expect(result.items[0].incorrectAnswers.every((a) => a.startsWith("term"))).toBe(true);
  });

  it("excludes case-insensitive duplicates of the correct answer from distractors", () => {
    const pairs: TermPair[] = [
      { term: "t1", definition: "Red", row: 1 },
      { term: "t2", definition: "red", row: 2 },
      { term: "t3", definition: "Blue", row: 3 },
      { term: "t4", definition: "Green", row: 4 },
      { term: "t5", definition: "Yellow", row: 5 },
    ];
    const result = build(pairs);
    for (const item of result.items) {
      expect(item.incorrectAnswers.map((a) => a.toLowerCase())).not.toContain(item.correctAnswer.toLowerCase());
      const lowered = item.incorrectAnswers.map((a) => a.toLowerCase());
      expect(new Set(lowered).size).toBe(lowered.length);
    }
  });

  it("does not offer another valid answer to the same question as a distractor", () => {
    const pairs: TermPair[] = [
      { term: "bank", definition: "river side", row: 1 },
      { term: "bank", definition: "money place", row: 2 },
      { term: "x", definition: "other1", row: 3 },
      { term: "y", definition: "other2", row: 4 },
    ];
    const result = build(pairs);
    const first = result.items.find((i) => i.correctAnswer === "river side");
    expect(first?.incorrectAnswers).not.toContain("money place");
  });

  it("dedupes identical rows within the batch", () => {
    const pairs = [...pairsOf(4), { term: "TERM0", definition: "DEF0", row: 5 }];
    const result = build(pairs);
    expect(result.items).toHaveLength(4);
    expect(result.duplicates).toBe(1);
  });

  it("requires at least 4 usable rows", () => {
    const result = build(pairsOf(3));
    expect(result.items).toEqual([]);
    expect(result.error).toMatch(/at least 4/i);
  });

  it("skips over-long answers and questions and counts them as unusable", () => {
    const pairs = [...pairsOf(4), { term: "long", definition: "x".repeat(201), row: 5 }, { term: "y".repeat(1001), definition: "d", row: 6 }];
    const result = build(pairs);
    expect(result.items).toHaveLength(4);
    expect(result.skipped.map((s) => s.row)).toEqual([5, 6]);
    expect(build(pairs.slice(0, 3).concat(pairs.slice(4))).error).toMatch(/at least 4/i);
  });

  it("skips rows with no distinct distractor available", () => {
    const pairs: TermPair[] = [1, 2, 3, 4].map((i) => ({ term: `t${i}`, definition: "same", row: i }));
    const result = build(pairs);
    expect(result.items).toEqual([]);
    expect(result.error).not.toBeNull();
  });

  it("limits to the upload limit and reports how many were left out", () => {
    const result = build(pairsOf(130), { limit: 100 });
    expect(result.items).toHaveLength(100);
    expect(result.truncated).toBe(30);
    const admin = build(pairsOf(130), { limit: 1000 });
    expect(admin.items).toHaveLength(130);
    expect(admin.truncated).toBe(0);
  });
});

describe("stripHtml nested fragments", () => {
  it("leaves no tag behind for nested or overlapping fragments", () => {
    expect(stripHtml("<scr<b>ipt>alert(1)</scr</b>ipt>")).not.toMatch(/<\/?[a-zA-Z]/);
  });
});
