/**
 * Renders a plain-text string with any http/https URLs converted to clickable links.
 * Inline usage: <TextWithLinks text={someString} />
 */

// One capture group: split() puts every captured URL at an odd index and plain text at even indexes.
const URL_SPLIT = /(https?:\/\/[^\s),]+)/g;

/** Returns the candidate only when it parses as an absolute http or https URL; otherwise null (rendered as text). */
function toSafeHttpUrl(candidate: string): string | null {
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? candidate : null;
  } catch {
    return null;
  }
}

export function TextWithLinks({ text }: { text: string }) {
  const parts = text.split(URL_SPLIT);
  return (
    <>
      {parts.map((part, i) => {
        const href = i % 2 === 1 ? toSafeHttpUrl(part) : null;
        return href ? (
          <a
            key={i}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline break-all hover:opacity-80"
          >
            {part}
          </a>
        ) : (
          part
        );
      })}
    </>
  );
}
