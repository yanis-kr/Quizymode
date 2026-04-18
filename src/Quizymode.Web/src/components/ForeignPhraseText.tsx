/**
 * Renders text that may contain inline foreign-phrase markup:
 *   {{lang|native|translit|pronunciation}}
 *
 * Foreign segments display the native script with a compact hint line below
 * (transliteration and/or English-friendly stress pronunciation).
 * Plain segments render as ordinary text.
 *
 * For items with no markup the output is identical to a plain text node —
 * zero visual change for non-language content.
 */
import { parseForeignPhrases, getSegmentHint, type Segment } from "@/utils/foreignPhrase";
import { TextWithLinks } from "@/components/TextWithLinks";

interface ForeignPhraseTextProps {
  text: string;
  /** When true, plain segments are rendered through TextWithLinks (for explanation fields). */
  linkify?: boolean;
  className?: string;
}

export function ForeignPhraseText({ text, linkify = false, className }: ForeignPhraseTextProps) {
  const segments = parseForeignPhrases(text);

  return (
    <span className={className}>
      {segments.map((seg, i) => (
        <SegmentView key={i} segment={seg} linkify={linkify} />
      ))}
    </span>
  );
}

function SegmentView({ segment, linkify }: { segment: Segment; linkify: boolean }) {
  if (segment.type === "plain") {
    return linkify ? <TextWithLinks text={segment.text} /> : <>{segment.text}</>;
  }

  const hint = getSegmentHint(segment);

  return (
    <span className="inline-flex flex-col align-top leading-snug">
      <span lang={segment.lang}>{segment.text}</span>
      {hint && (
        <span className="text-xs text-gray-400 italic leading-tight">{hint}</span>
      )}
    </span>
  );
}
