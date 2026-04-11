/**
 * Renders a plain-text string with any http/https URLs converted to clickable links.
 * Inline usage: <TextWithLinks text={someString} />
 */

const URL_SPLIT = /(https?:\/\/[^\s),]+)/g;
const URL_TEST = /^https?:\/\//;

export function TextWithLinks({ text }: { text: string }) {
  const parts = text.split(URL_SPLIT);
  return (
    <>
      {parts.map((part, i) =>
        URL_TEST.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="underline break-all hover:opacity-80"
          >
            {part}
          </a>
        ) : (
          part
        )
      )}
    </>
  );
}
