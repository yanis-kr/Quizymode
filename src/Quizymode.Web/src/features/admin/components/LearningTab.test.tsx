import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import LearningTab from "./LearningTab";

const { mockGetLearningReport } = vi.hoisted(() => ({ mockGetLearningReport: vi.fn() }));

vi.mock("@/api/admin", () => ({
  adminApi: { getLearningReport: mockGetLearningReport },
}));

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LearningTab days={30} includeBots={false} />
    </QueryClientProvider>
  );
}

describe("LearningTab", () => {
  beforeEach(() => {
    mockGetLearningReport.mockReset();
  });

  it("lists each mode and scope with completion and drop-off", async () => {
    mockGetLearningReport.mockResolvedValue({
      windowStartUtc: "2026-10-01T00:00:00Z",
      windowEndUtc: "2026-10-14T00:00:00Z",
      botSessions: 2,
      botsExcluded: true,
      internalSessions: 3,
      internalExcluded: true,
      scopes: [
        {
          mode: "quiz",
          contextType: "category",
          contextId: "science",
          runsStarted: 10,
          runsCompleted: 6,
          completionRatePercent: 60,
          averageScorePercent: 75.5,
          averageItemsReached: 7.2,
        },
        {
          mode: "flashcards",
          contextType: null,
          contextId: null,
          runsStarted: 4,
          runsCompleted: null,
          completionRatePercent: null,
          averageScorePercent: null,
          averageItemsReached: 3,
        },
      ],
      quizRunsAbandonedBeforeFirstAnswer: 2,
      quizDropOff: [
        { position: 1, runsReached: 10, sharePercent: 100, runsAbandonedHere: 1 },
        { position: 2, runsReached: 9, sharePercent: 90, runsAbandonedHere: 3 },
      ],
    });

    renderTab();

    const quizRow = (await screen.findByText("quiz")).closest("tr") as HTMLTableRowElement;
    expect(within(quizRow).getByText("category: science")).toBeInTheDocument();
    expect(within(quizRow).getByText("10")).toBeInTheDocument();
    expect(within(quizRow).getByText("60%")).toBeInTheDocument();
    expect(within(quizRow).getByText("75.5%")).toBeInTheDocument();

    const flashcardsRow = screen.getByText("flashcards").closest("tr") as HTMLTableRowElement;
    expect(within(flashcardsRow).getByText("All")).toBeInTheDocument();
    expect(within(flashcardsRow).getAllByText("—")).toHaveLength(3);

    expect(screen.getByText(/2 bot sessions were excluded/)).toBeInTheDocument();
    expect(screen.getByText(/3 internal sessions were excluded/)).toBeInTheDocument();
    expect(screen.getByText(/2 runs started and never answered a question/)).toBeInTheDocument();
    expect(screen.getByText(/10 reached \(100%\)/)).toBeInTheDocument();
    expect(screen.getByText(/3 stopped here/)).toBeInTheDocument();
    expect(mockGetLearningReport).toHaveBeenCalledWith(30, false, false, undefined, undefined);
  });

  it("shows empty states when nothing was recorded", async () => {
    mockGetLearningReport.mockResolvedValue({
      windowStartUtc: "2026-10-01T00:00:00Z",
      windowEndUtc: "2026-10-14T00:00:00Z",
      botSessions: 0,
      botsExcluded: true,
      internalSessions: 0,
      internalExcluded: true,
      scopes: [],
      quizRunsAbandonedBeforeFirstAnswer: 0,
      quizDropOff: [],
    });

    renderTab();

    expect(await screen.findByText(/No study activity recorded/i)).toBeInTheDocument();
    expect(screen.getByText(/No quiz runs recorded/i)).toBeInTheDocument();
  });

  it("shows an error state when the report fails", async () => {
    mockGetLearningReport.mockRejectedValue(new Error("boom"));

    renderTab();

    expect(await screen.findByText("Failed to load the learning report")).toBeInTheDocument();
  });

  it("applies the channel and visitor type filters", async () => {
    mockGetLearningReport.mockResolvedValue({
      windowStartUtc: "2026-10-01T00:00:00Z",
      windowEndUtc: "2026-10-14T00:00:00Z",
      botSessions: 0,
      botsExcluded: true,
      internalSessions: 0,
      internalExcluded: true,
      scopes: [],
      quizRunsAbandonedBeforeFirstAnswer: 0,
      quizDropOff: [],
    });

    renderTab();
    await screen.findByText(/No study activity recorded/i);

    fireEvent.change(screen.getByLabelText("Channel"), { target: { value: "search" } });
    await waitFor(() =>
      expect(mockGetLearningReport).toHaveBeenLastCalledWith(30, false, false, "search", undefined)
    );

    fireEvent.change(screen.getByLabelText("Visitor type"), { target: { value: "returning" } });
    await waitFor(() =>
      expect(mockGetLearningReport).toHaveBeenLastCalledWith(30, false, false, "search", "returning")
    );
  });
});
