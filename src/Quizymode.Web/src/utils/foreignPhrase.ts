/**
 * Inline foreign-phrase markup for language-learning items.
 *
 * Format inside any text field:  {{lang|native|translit|pronunciation}}
 *
 *   lang         — BCP-47 language code (required)
 *   native       — original foreign text, spoken by TTS in the target language (required)
 *   translit     — romanization / transliteration, optional (omit or leave empty)
 *   pronunciation — English-friendly with stressed syllable in CAPS, e.g. "spa-SEE-ba" (optional)
 *
 * Examples:
 *   "What does '{{ru-RU|спасибо|spasibo|spa-SEE-ba}}' mean?"
 *   "{{ja-JP|こんにちは|konnichiwa|kon-NEE-chee-wah}}"
 *   "The word is {{fr-FR|bonjour||bon-ZHOOR}}."   ← no translit, just stress
 *
 * Items without markup are unaffected — the parser returns a single plain segment.
 */

/** A plain-text run with no language override. */
export interface PlainSegment {
  type: "plain";
  text: string;
}

/** A foreign-language run parsed from {{lang|native|translit|pronunciation}} markup. */
export interface ForeignSegment {
  type: "foreign";
  /** The native-script text to display and speak via TTS in the target language. */
  text: string;
  /** BCP-47 language code, e.g. "ru-RU", "ja-JP". */
  lang: string;
  /** Romanization / transliteration, shown as a reading hint (e.g. "konnichiwa"). */
  translit?: string;
  /** English-friendly pronunciation with stressed syllable in CAPS (e.g. "kon-NEE-chee-wah"). */
  pronunciation?: string;
}

export type Segment = PlainSegment | ForeignSegment;

// Matches {{lang|native}} or {{lang|native|translit}} or {{lang|native|translit|pronunciation}}
// The lang and native fields are required; translit and pronunciation are optional.
const MARKER_RE = /\{\{([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)\|([^|{}]+)(?:\|([^|{}]*))?(?:\|([^|{}]*))?\}\}/g;

/**
 * Splits `text` into an array of plain and foreign segments.
 * Returns a single PlainSegment when no markup is present (zero overhead for normal items).
 */
export function parseForeignPhrases(text: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(MARKER_RE)) {
    const [full, lang, native, translit, pronunciation] = match;
    const matchStart = match.index ?? 0;

    if (matchStart > lastIndex) {
      segments.push({ type: "plain", text: text.slice(lastIndex, matchStart) });
    }

    segments.push({
      type: "foreign",
      text: native,
      lang,
      ...(translit?.trim() ? { translit: translit.trim() } : {}),
      ...(pronunciation?.trim() ? { pronunciation: pronunciation.trim() } : {}),
    });

    lastIndex = matchStart + full.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "plain", text: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: "plain", text }];
}

/** Returns true when `text` contains at least one foreign-phrase marker. */
export function hasForeignPhrases(text: string): boolean {
  MARKER_RE.lastIndex = 0;
  return MARKER_RE.test(text);
}

/**
 * Strips all markup and returns plain displayable text.
 * Useful for accessibility attributes, document titles, etc.
 */
export function toPlainText(text: string): string {
  return text.replace(MARKER_RE, (_, _lang, native) => native);
}

/**
 * Returns the display hint for a foreign segment: "translit · pronunciation", or just one of them.
 * Returns null when neither field is set.
 */
export function getSegmentHint(seg: ForeignSegment): string | null {
  const parts = [seg.translit, seg.pronunciation].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}
