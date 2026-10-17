import { describe, expect, it } from "vitest";
import type { IdeaSummaryResponse } from "@/api/ideas";
import {
  buildIdeaExcerpt,
  formatIdeaTimestamp,
  formatModerationLabel,
  groupIdeasByModeration,
  groupIdeasByStatus,
  matchesIdeaSearch,
  sortIdeas,
} from "./ideaBoard";

function makeIdea(overrides: Partial<IdeaSummaryResponse>): IdeaSummaryResponse {
  return {
    id: "idea",
    title: "Title",
    problem: "Problem text",
    proposedChange: "Proposed change text",
    tradeOffs: null,
    status: "Proposed",
    moderationState: "Published",
    moderationNotes: null,
    authorName: "Author",
    reviewedByName: null,
    createdAt: "2026-04-01T10:00:00Z",
    updatedAt: null,
    reviewedAt: null,
    commentCount: 0,
    ratingCount: 0,
    averageStars: null,
    myRating: null,
    canEdit: false,
    canDelete: false,
    canChangeStatus: false,
    ...overrides,
  };
}

describe("sortIdeas", () => {
  const older = makeIdea({ id: "older", createdAt: "2026-03-01T10:00:00Z" });
  const newer = makeIdea({ id: "newer", createdAt: "2026-04-01T10:00:00Z" });
  const edited = makeIdea({
    id: "edited",
    createdAt: "2026-02-01T10:00:00Z",
    updatedAt: "2026-05-01T10:00:00Z",
  });

  it("sorts by most recent activity, preferring updatedAt over createdAt", () => {
    expect(sortIdeas([older, newer, edited], "recent").map((i) => i.id)).toEqual([
      "edited",
      "newer",
      "older",
    ]);
  });

  it("does not mutate the input array", () => {
    const input = [older, newer];
    sortIdeas(input, "recent");
    expect(input.map((i) => i.id)).toEqual(["older", "newer"]);
  });

  it("sorts by average rating, then rating count, then recency", () => {
    const high = makeIdea({ id: "high", averageStars: 4.8, ratingCount: 2 });
    const mid = makeIdea({ id: "mid", averageStars: 4, ratingCount: 10 });
    const midFewer = makeIdea({ id: "mid-fewer", averageStars: 4, ratingCount: 3 });
    const unrated = makeIdea({ id: "unrated", createdAt: "2026-06-01T10:00:00Z" });
    const unratedOlder = makeIdea({ id: "unrated-older", createdAt: "2026-01-01T10:00:00Z" });

    expect(
      sortIdeas([unratedOlder, midFewer, unrated, mid, high], "rating").map((i) => i.id)
    ).toEqual(["high", "mid", "mid-fewer", "unrated", "unrated-older"]);
  });
});

describe("matchesIdeaSearch", () => {
  const idea = makeIdea({
    title: "Resumable study sessions",
    problem: "Learners lose context",
    proposedChange: "Add a continue button",
    tradeOffs: "Needs persistence",
    authorName: "Quizymode",
    moderationNotes: "Flagged for tone",
  });

  it("matches everything for an empty search", () => {
    expect(matchesIdeaSearch(idea, "")).toBe(true);
  });

  it.each([
    ["title", "resumable"],
    ["problem", "lose context"],
    ["proposed change", "CONTINUE button"],
    ["trade-offs", "persistence"],
    ["author", "quizymode"],
    ["moderation notes", "flagged"],
  ])("matches on %s case-insensitively", (_field, term) => {
    expect(matchesIdeaSearch(idea, term)).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(matchesIdeaSearch(idea, "calendar integration")).toBe(false);
  });

  it("handles missing optional fields", () => {
    expect(
      matchesIdeaSearch(makeIdea({ tradeOffs: null, moderationNotes: null }), "zzz")
    ).toBe(false);
  });
});

describe("grouping", () => {
  const ideas = [
    makeIdea({ id: "a", status: "Planned", moderationState: "Published" }),
    makeIdea({ id: "b", status: "Shipped", moderationState: "Rejected" }),
    makeIdea({ id: "c", status: "Planned", moderationState: "PendingReview" }),
  ];

  it("groups by lifecycle status with every lane present", () => {
    const grouped = groupIdeasByStatus(ideas);
    expect(Object.keys(grouped)).toEqual([
      "Proposed",
      "Planned",
      "In Progress",
      "Shipped",
      "Archived",
    ]);
    expect(grouped.Planned.map((i) => i.id)).toEqual(["a", "c"]);
    expect(grouped.Shipped.map((i) => i.id)).toEqual(["b"]);
    expect(grouped.Archived).toEqual([]);
  });

  it("groups by moderation state with every bucket present", () => {
    const grouped = groupIdeasByModeration(ideas);
    expect(grouped.PendingReview.map((i) => i.id)).toEqual(["c"]);
    expect(grouped.Published.map((i) => i.id)).toEqual(["a"]);
    expect(grouped.Rejected.map((i) => i.id)).toEqual(["b"]);
  });
});

describe("formatting helpers", () => {
  it("labels moderation states for display", () => {
    expect(formatModerationLabel("PendingReview")).toBe("Pending review");
    expect(formatModerationLabel("Published")).toBe("Published");
    expect(formatModerationLabel("Rejected")).toBe("Rejected");
  });

  it("truncates long excerpts and leaves short text alone", () => {
    expect(buildIdeaExcerpt("  short text  ", 20)).toBe("short text");
    const excerpt = buildIdeaExcerpt("a".repeat(50), 10);
    expect(excerpt).toBe(`${"a".repeat(9)}...`);
  });

  it("says Added when never updated and Updated otherwise", () => {
    expect(formatIdeaTimestamp("2026-04-01T10:00:00Z")).toMatch(/^Added /);
    expect(formatIdeaTimestamp("2026-04-01T10:00:00Z", "2026-04-01T10:00:00Z")).toMatch(
      /^Added /
    );
    expect(formatIdeaTimestamp("2026-04-01T10:00:00Z", "2026-04-05T10:00:00Z")).toMatch(
      /^Updated /
    );
  });
});
