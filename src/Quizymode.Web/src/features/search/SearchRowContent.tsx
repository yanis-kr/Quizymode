import type { ComponentType, ReactNode } from "react";
import {
  BookOpenIcon,
  DocumentTextIcon,
  QuestionMarkCircleIcon,
  RectangleStackIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";
import HighlightedText from "./HighlightedText";
import type { SearchRowData } from "./searchResultLinks";

interface SearchRowContentProps {
  data: SearchRowData;
  tokens: string[];
  /** The dropdown clamps long text; the page shows more of it. */
  density: "dropdown" | "page";
}

const ICON_CLASS = "mt-0.5 h-5 w-5 shrink-0 text-slate-400";

function CountPill({ count }: { count: number }) {
  if (count <= 0) {
    return null;
  }

  return (
    <span className="ml-auto shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-semibold text-slate-800">
      <span aria-hidden="true">{count}</span>
      <span className="sr-only">{count === 1 ? "1 item" : `${count} items`}</span>
    </span>
  );
}

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

function Breadcrumb({ parts, tokens }: { parts: string[]; tokens: string[] }) {
  return (
    <>
      {parts.map((part, index) => (
        <span key={`${part}-${index}`}>
          {index > 0 && <Separator />}
          <HighlightedText text={part} tokens={tokens} />
        </span>
      ))}
    </>
  );
}

function Row({
  icon: Icon,
  children,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  children: ReactNode;
}) {
  return (
    <>
      <Icon className={ICON_CLASS} aria-hidden="true" />
      <div className="flex min-w-0 flex-1 items-start gap-3">{children}</div>
    </>
  );
}

const SearchRowContent = ({ data, tokens, density }: SearchRowContentProps) => {
  const descriptionClass = density === "page" ? "text-xs text-slate-600" : "truncate text-xs text-slate-600";

  switch (data.type) {
    case "category":
      return (
        <Row icon={Squares2X2Icon}>
          <div className="min-w-0 flex-1">
            <div className="font-medium">
              <HighlightedText text={data.value.slug} tokens={tokens} />
            </div>
            {data.value.description && (
              <div className={descriptionClass}>
                <HighlightedText text={data.value.description} tokens={tokens} />
              </div>
            )}
          </div>
          <CountPill count={data.value.itemCount} />
        </Row>
      );
    case "subcategory": {
      const parts = [data.value.categorySlug, data.value.l1, ...(data.value.l2 ? [data.value.l2] : [])];
      return (
        <Row icon={Squares2X2Icon}>
          <div className="min-w-0 flex-1">
            <div className="font-medium">
              <Breadcrumb parts={parts} tokens={tokens} />
            </div>
            {data.value.description && (
              <div className={descriptionClass}>
                <HighlightedText text={data.value.description} tokens={tokens} />
              </div>
            )}
          </div>
          <CountPill count={data.value.itemCount} />
        </Row>
      );
    }
    case "collection":
      return (
        <Row icon={RectangleStackIcon}>
          <div className="min-w-0 flex-1">
            <div className="font-medium">
              <HighlightedText text={data.value.name} tokens={tokens} />
            </div>
            {data.value.description && (
              <div className={descriptionClass}>
                <HighlightedText text={data.value.description} tokens={tokens} />
              </div>
            )}
          </div>
          {data.value.itemCount > 0 && (
            <span className="ml-auto shrink-0 text-xs text-slate-600">
              {data.value.itemCount === 1 ? "1 item" : `${data.value.itemCount} items`}
            </span>
          )}
        </Row>
      );
    case "question": {
      const crumbs = [data.value.categorySlug, data.value.l1, data.value.l2].filter(
        (part): part is string => Boolean(part)
      );
      const snippetClass = density === "page" ? "line-clamp-3 max-h-[4.5rem] overflow-hidden" : "line-clamp-2 max-h-10 overflow-hidden";
      return (
        <Row icon={QuestionMarkCircleIcon}>
          <div className="min-w-0 flex-1">
            <div className={snippetClass}>
              <HighlightedText text={data.value.snippet.text} ranges={data.value.snippet.highlights} />
            </div>
            {crumbs.length > 0 && (
              <div className="mt-0.5 text-xs text-slate-600">
                <Breadcrumb parts={crumbs} tokens={[]} />
              </div>
            )}
          </div>
        </Row>
      );
    }
    case "mine": {
      const isDocument = data.value.kind === "studyGuideDocument";
      const kindLabel = data.value.kind === "collection" ? "Collection" : isDocument ? "Study guide" : "Question";
      return (
        <Row icon={isDocument ? DocumentTextIcon : data.value.kind === "collection" ? BookOpenIcon : QuestionMarkCircleIcon}>
          <div className="min-w-0 flex-1">
            <div className="font-medium">
              <HighlightedText text={data.value.title} tokens={tokens} />
            </div>
            <div className="text-xs text-slate-600">{kindLabel}</div>
          </div>
        </Row>
      );
    }
  }
};

export default SearchRowContent;
