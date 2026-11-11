import type { TopicMember } from "@/api/collections";

interface TopicMembersSectionProps {
  topics: TopicMember[];
}

/** Sorted by when the topic was added, oldest first (#557). */
function sortByAddedAt(topics: TopicMember[]): TopicMember[] {
  return [...topics].sort((a, b) => a.addedAt.localeCompare(b.addedAt));
}

function topicLabel(topic: TopicMember): string {
  return [topic.categoryName, topic.keyword1Name, topic.keyword2Name].filter(Boolean).join(" / ");
}

/**
 * Taxonomy path members of a collection. Each row is live: its questions update automatically when the
 * taxonomy changes. Removed paths are flagged and count zero. A topic above 500 visible questions shows a
 * nonblocking notice; nothing is truncated (#549 decision 6).
 */
export function TopicMembersSection({ topics }: TopicMembersSectionProps) {
  if (topics.length === 0) return null;

  return (
    <section
      aria-labelledby="topic-members-heading"
      className="rounded-[24px] border border-slate-200/80 bg-surface/90 p-4 shadow-sm shadow-slate-300/20"
    >
      <h2 id="topic-members-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Topics
      </h2>
      <ul className="mt-2 divide-y divide-slate-200">
        {sortByAddedAt(topics).map((topic) => (
          <li key={topic.id} className="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-1 py-2">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="mt-0.5 h-5 w-5 flex-shrink-0 text-slate-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
            </svg>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="min-w-0 break-words font-medium text-slate-900">{topicLabel(topic)}</span>
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  Live
                  <span className="sr-only"> (updates automatically)</span>
                </span>
                {topic.isRemoved && (
                  <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                    Removed topic
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {topic.isRemoved ? "No questions" : `${topic.visibleItemCount} questions you can see`}
              </p>
              {topic.exceedsWarningThreshold && (
                <p role="note" className="text-xs text-amber-800">
                  More than 500 questions. All of them are listed; nothing is cut off.
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
