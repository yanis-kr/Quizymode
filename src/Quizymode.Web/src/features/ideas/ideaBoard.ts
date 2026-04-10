import type {
  IdeaModerationState,
  IdeaStatus,
  IdeaSummaryResponse,
} from "@/api/ideas";

export type BoardSort = "recent" | "rating";

export const STATUS_ORDER: IdeaStatus[] = [
  "Proposed",
  "Planned",
  "In Progress",
  "Shipped",
  "Archived",
];

export const MODERATION_ORDER: IdeaModerationState[] = [
  "PendingReview",
  "Published",
  "Rejected",
];

export function sortIdeas(
  ideas: IdeaSummaryResponse[],
  sortBy: BoardSort
): IdeaSummaryResponse[] {
  return [...ideas].sort((left, right) => {
    if (sortBy === "rating") {
      const ratingDelta =
        (right.averageStars ?? 0) - (left.averageStars ?? 0);
      if (ratingDelta !== 0) {
        return ratingDelta;
      }

      const ratingCountDelta = right.ratingCount - left.ratingCount;
      if (ratingCountDelta !== 0) {
        return ratingCountDelta;
      }
    }

    return (
      new Date(right.updatedAt ?? right.createdAt).getTime() -
      new Date(left.updatedAt ?? left.createdAt).getTime()
    );
  });
}

export function matchesIdeaSearch(
  idea: IdeaSummaryResponse,
  searchText: string
): boolean {
  if (!searchText) {
    return true;
  }

  const haystack = [
    idea.title,
    idea.problem,
    idea.proposedChange,
    idea.tradeOffs ?? "",
    idea.authorName,
    idea.moderationNotes ?? "",
  ]
    .join("\n")
    .toLowerCase();

  return haystack.includes(searchText.toLowerCase());
}

export function groupIdeasByStatus(ideas: IdeaSummaryResponse[]) {
  const grouped = Object.fromEntries(
    STATUS_ORDER.map((status) => [status, [] as IdeaSummaryResponse[]])
  ) as Record<IdeaStatus, IdeaSummaryResponse[]>;

  for (const idea of ideas) {
    grouped[idea.status].push(idea);
  }

  return grouped;
}

export function groupIdeasByModeration(ideas: IdeaSummaryResponse[]) {
  const grouped = Object.fromEntries(
    MODERATION_ORDER.map((state) => [state, [] as IdeaSummaryResponse[]])
  ) as Record<IdeaModerationState, IdeaSummaryResponse[]>;

  for (const idea of ideas) {
    grouped[idea.moderationState].push(idea);
  }

  return grouped;
}

export function formatStatusLabel(status: IdeaStatus): string {
  return status;
}

export function formatModerationLabel(
  moderationState: IdeaModerationState
): string {
  switch (moderationState) {
    case "PendingReview":
      return "Pending review";
    case "Published":
      return "Published";
    case "Rejected":
      return "Rejected";
  }
}

export function getStatusBadgeClass(status: IdeaStatus): string {
  switch (status) {
    case "Proposed":
      return "border-slate-300 bg-slate-100 text-slate-700";
    case "Planned":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "In Progress":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "Shipped":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "Archived":
      return "border-zinc-300 bg-zinc-100 text-zinc-600";
  }
}

export function getModerationBadgeClass(
  moderationState: IdeaModerationState
): string {
  switch (moderationState) {
    case "PendingReview":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "Published":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "Rejected":
      return "border-rose-200 bg-rose-50 text-rose-700";
  }
}

export function formatIdeaTimestamp(
  createdAt: string,
  updatedAt?: string | null
): string {
  const createdLabel = new Date(createdAt).toLocaleDateString();
  if (!updatedAt || updatedAt === createdAt) {
    return `Added ${createdLabel}`;
  }

  return `Updated ${new Date(updatedAt).toLocaleDateString()}`;
}

export function buildIdeaExcerpt(text: string, maxLength: number): string {
  const normalized = text.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}
