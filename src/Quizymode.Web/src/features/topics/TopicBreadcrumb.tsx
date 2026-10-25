import HighlightedText from "@/features/search/HighlightedText";

function Separator() {
  return (
    <>
      <span aria-hidden="true" className="mx-1 text-slate-400">
        ›
      </span>
      <span className="sr-only">, </span>
    </>
  );
}

interface TopicBreadcrumbProps {
  parts: string[];
  /** Words to highlight (the picker query); none by default. */
  tokens?: string[];
}

/** A slug path such as tech › ai-ml › deep-learning. The separator is decorative; screen readers hear commas. */
const TopicBreadcrumb = ({ parts, tokens = [] }: TopicBreadcrumbProps) => (
  <>
    {parts.map((part, index) => (
      <span key={`${part}-${index}`}>
        {index > 0 && <Separator />}
        <HighlightedText text={part} tokens={tokens} />
      </span>
    ))}
  </>
);

export default TopicBreadcrumb;
