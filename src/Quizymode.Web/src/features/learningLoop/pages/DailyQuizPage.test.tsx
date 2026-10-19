import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import { dailyQuizApi } from "@/api/learningLoop";
import { saveStudySession } from "@/features/studySessions/recordStudySession";
import { trackEventOnce } from "@/features/analytics/analyticsEvents";
import DailyQuizPage from "./DailyQuizPage";
import { readDailyCompletions } from "../localLearningState";
import { renderWithProviders, testItem } from "../learningLoopTestUtils";

const auth = vi.hoisted(() => ({ value: { isAuthenticated: false, isLoading: false, userId: null as string | null } }));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth.value }));
vi.mock("@/api/learningLoop", () => ({ dailyQuizApi: { get: vi.fn(), complete: vi.fn() } }));
vi.mock("@/features/studySessions/recordStudySession", () => ({ saveStudySession: vi.fn().mockResolvedValue(true) }));
vi.mock("@/features/analytics/analyticsEvents", () => ({
  trackEventOnce: vi.fn(),
  trackEventDeferredOnce: vi.fn(),
  flushDeferredAnalyticsEvents: vi.fn(),
}));

const items = [testItem("a"), testItem("b")];

async function answerAll(correctIds: string[]) {
  for (const item of items) {
    const answer = correctIds.includes(item.id) ? item.correctAnswer : item.incorrectAnswers[0];
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(answer) }));
    if (item !== items[items.length - 1]) fireEvent.click(screen.getByRole("button", { name: "Next" }));
  }
  fireEvent.click(screen.getByRole("button", { name: "View results" }));
}

describe("DailyQuizPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMemoryLocalStorage();
    auth.value = { isAuthenticated: false, isLoading: false, userId: null };
  });

  it("anonymous: counts the first run in this browser and reports daily analytics", async () => {
    vi.mocked(dailyQuizApi.get).mockResolvedValue({ date: "2026-10-18", items, completion: null, streak: null });

    renderWithProviders(<DailyQuizPage />);
    await answerAll(["a"]);

    expect(await screen.findByText(/Counted for today · 1-day streak/)).toBeInTheDocument();
    expect(readDailyCompletions()).toEqual([{ date: "2026-10-18", correct: 1, total: 2 }]);
    expect(dailyQuizApi.complete).not.toHaveBeenCalled();
    expect(trackEventOnce).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ name: "quiz_completed", contextType: "daily", contextId: "2026-10-18", score: 1, total: 2 }),
    );
    expect(screen.getByRole("heading", { name: "Quiz complete" })).toBeInTheDocument();
  });

  it("signed in: records the completion, then saves the run so misses reach the review queue", async () => {
    auth.value = { isAuthenticated: true, isLoading: false, userId: "user-1" };
    vi.mocked(dailyQuizApi.get).mockResolvedValue({ date: "2026-10-18", items, completion: null, streak: 2 });
    vi.mocked(dailyQuizApi.complete).mockResolvedValue({
      created: true,
      streak: 3,
      completion: { correct: 1, total: 2, completedAt: "2026-10-18T10:00:00Z" },
    });

    renderWithProviders(<DailyQuizPage />);
    expect(await screen.findByText(/2-day streak/)).toBeInTheDocument();
    await answerAll(["b"]);

    expect(await screen.findByText(/Counted for today · 3-day streak/)).toBeInTheDocument();
    expect(dailyQuizApi.complete).toHaveBeenCalledWith("2026-10-18", 1, 2);
    await waitFor(() =>
      expect(saveStudySession).toHaveBeenCalledWith(expect.objectContaining({ source: null, correct: 1, total: 2, missedItemIds: ["a"] })),
    );
    expect(readDailyCompletions()).toEqual([]);
  });

  it("shows the done state when today is already counted and lets the learner practice", async () => {
    auth.value = { isAuthenticated: true, isLoading: false, userId: "user-1" };
    vi.mocked(dailyQuizApi.get).mockResolvedValue({
      date: "2026-10-18",
      items,
      completion: { correct: 2, total: 2, completedAt: "2026-10-18T09:00:00Z" },
      streak: 4,
    });

    renderWithProviders(<DailyQuizPage />);

    expect(await screen.findByText("Done for today: 2 / 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Practice again" }));
    await answerAll([]);
    expect(await screen.findByText(/Practice run: today's result was already counted/)).toBeInTheDocument();
    expect(dailyQuizApi.complete).not.toHaveBeenCalled();
  });

  it("shows empty and error states", async () => {
    vi.mocked(dailyQuizApi.get).mockResolvedValueOnce({ date: "2026-10-18", items: [], completion: null, streak: null });
    const { unmount } = renderWithProviders(<DailyQuizPage />);
    expect(await screen.findByText(/There is no daily quiz today/)).toBeInTheDocument();
    unmount();

    vi.mocked(dailyQuizApi.get).mockRejectedValue(new Error("down"));
    renderWithProviders(<DailyQuizPage />);
    expect(await screen.findByRole("alert", undefined, { timeout: 4000 })).toHaveTextContent("Today's quiz could not be loaded.");
  });
});
