import type { SearchHighlight } from "@/api/search";

export interface TextSegment {
  text: string;
  match: boolean;
}

const MAX_TOKENS = 8;

/** Lower-cased words of the query (letters and digits), longest first, for client-side title highlighting. */
export function queryTokens(query: string): string[] {
  const words = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(words)]
    .filter((word) => word.length >= 2)
    .slice(0, MAX_TOKENS)
    .sort((a, b) => b.length - a.length);
}

function toSegments(text: string, ranges: SearchHighlight[]): TextSegment[] {
  const sorted = [...ranges]
    .filter((range) => range.length > 0 && range.start >= 0 && range.start < text.length)
    .sort((a, b) => a.start - b.start);

  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const range of sorted) {
    if (range.start < cursor) {
      continue;
    }

    const end = Math.min(text.length, range.start + range.length);
    if (range.start > cursor) {
      segments.push({ text: text.slice(cursor, range.start), match: false });
    }
    segments.push({ text: text.slice(range.start, end), match: true });
    cursor = end;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), match: false });
  }

  return segments.length > 0 ? segments : [{ text, match: false }];
}

/** Splits text on server highlight ranges (UTF-16 offsets, the same indexing as JavaScript strings). */
export function segmentByRanges(text: string, ranges: SearchHighlight[]): TextSegment[] {
  return toSegments(text, ranges);
}

/** Highlights the start of every word that begins with a query token. */
export function segmentByTokens(text: string, tokens: string[]): TextSegment[] {
  if (tokens.length === 0) {
    return [{ text, match: false }];
  }

  const ranges: SearchHighlight[] = [];
  for (const word of text.matchAll(/[\p{L}\p{N}]+/gu)) {
    const lower = word[0].toLowerCase();
    const token = tokens.find((candidate) => lower.startsWith(candidate));
    if (token && word.index !== undefined) {
      ranges.push({ start: word.index, length: Math.min(token.length, word[0].length) });
    }
  }

  return toSegments(text, ranges);
}
