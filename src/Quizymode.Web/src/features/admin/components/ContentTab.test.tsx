import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ContentTab from "./ContentTab";

const { mockGetContentReport } = vi.hoisted(() => ({ mockGetContentReport: vi.fn() }));

vi.mock("@/api/admin", () => ({
  adminApi: { getContentReport: mockGetContentReport },
}));

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ContentTab days={30} includeBots={false} />
    </QueryClientProvider>
  );
}

const row = {
  key: "science",
  name: null,
  sessions: 5,
  studySessions: 3,
  itemSteps: 12,
  ratingsCount: 4,
  averageStars: 4.5,
  comments: 2,
  bookmarks: null,
  shares: null,
  completions: 1,
  averageScorePercent: 80,
};

describe("ContentTab", () => {
  beforeEach(() => {
    mockGetContentReport.mockReset();
  });

  it("renders content tables, featured click-through, untouched, and user-created", async () => {
    mockGetContentReport.mockResolvedValue({
      windowStartUtc: "2026-09-01T00:00:00Z",
      windowEndUtc: "2026-10-01T00:00:00Z",
      botSessions: 1,
      botsExcluded: true,
      internalSessions: 0,
      internalExcluded: true,
      categories: [row],
      navigationSets: [],
      collections: [{ ...row, key: "id-1", name: "Space", bookmarks: 2, shares: 1 }],
      featured: [
        {
          id: "f1",
          type: "set",
          displayName: "Capitals",
          sessionsSeen: 3,
          sessionsOpened: 1,
          clickThroughPercent: 33.3,
        },
      ],
      untouchedCategories: [{ key: "art", name: "Art" }],
      untouchedCollections: [],
      userCreated: [
        { weekStartUtc: "2026-09-28T00:00:00Z", privateItems: 1, publicItems: 2, collections: 3 },
      ],
    });

    renderTab();

    expect(await screen.findByText("science")).toBeInTheDocument();
    expect(screen.getByText("Space")).toBeInTheDocument();
    expect(screen.getByText("Capitals")).toBeInTheDocument();
    expect(screen.getByText("33.3%")).toBeInTheDocument();
    expect(screen.getByText("Art")).toBeInTheDocument();
    expect(screen.getByText("2026-09-28")).toBeInTheDocument();
    expect(screen.getByText(/1 bot session was excluded/)).toBeInTheDocument();
  });

  it("shows an error with retry when loading fails", async () => {
    mockGetContentReport.mockRejectedValue(new Error("boom"));

    renderTab();

    expect(await screen.findByText("Failed to load the content report")).toBeInTheDocument();
  });
});
