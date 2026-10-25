import type { SearchHighlight } from "@/api/search";
import { segmentByRanges, segmentByTokens } from "./highlight";

interface HighlightedTextProps {
  text: string;
  /** Highlight words that start with one of these tokens (client-side, for titles). */
  tokens?: string[];
  /** Highlight exact server ranges (snippets). Wins over tokens. */
  ranges?: SearchHighlight[];
}

/** Plain text plus <mark>; the text is always rendered as React text nodes, never as HTML. */
const HighlightedText = ({ text, tokens = [], ranges }: HighlightedTextProps) => {
  const segments = ranges ? segmentByRanges(text, ranges) : segmentByTokens(text, tokens);
  return (
    <>
      {segments.map((segment, index) =>
        segment.match ? (
          <mark key={index} className="rounded-sm bg-amber-100 px-0.5 font-semibold text-slate-900">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
    </>
  );
};

export default HighlightedText;
