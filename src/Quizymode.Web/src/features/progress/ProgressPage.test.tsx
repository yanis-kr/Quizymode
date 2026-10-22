import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { studySessionsApi } from "@/api/studySessions";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import { renderWithProviders } from "@/features/learningLoop/learningLoopTestUtils";
import { resetSignupPromptForTests } from "@/features/auth/utils/signupPrompt";
import {
  GUEST_HISTORY_STORAGE_KEY,
  resetGuestHistoryMemoryForTests,
} from "@/features/guestHistory/guestHistoryStorage";
import ProgressPage from "./ProgressPage";

const { auth } = vi.hoisted(() => ({
  auth: { isAuthenticated: true, isLoading: false, userId: "user-1" as string | null },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("@/features/analytics/analyticsEvents", () => ({
  trackEventOnce: vi.fn(),
  trackEventDeferredOnce: vi.fn(),
  flushDeferredAnalyticsEvents: vi.fn(),
}));
vi.mock("@/api/studySessions", () => ({
  studySessionsApi: { getSummary: vi.fn(), getActivity: vi.fn() },
}));

const summary = {
  totalSessions: 12,
  totalQuestions: 80,
  totalCorrect: 60,
  accuracyPercent: 75,
  last30DaysSessions: 5,
  last30DaysAccuracyPercent: 80,
  importedSessions: 0,
};

function activity(overrides = {}) {
  return {
    today: "2026-10-22",
    days: 182,
    currentStreak: 3,
    longestStreak: 9,
    activity: [{ date: "2026-10-21", sessions: 3, questions: 15, correct: 10, hasDaily: true }],
    ...overrides,
  };
}

describe("ProgressPage signed in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.isAuthenticated = true;
    auth.isLoading = false;
    auth.userId = "user-1";
  });

  it("shows totals from the summary endpoint, streak cards and the heatmap", async () => {
    vi.mocked(studySessionsApi.getSummary).mockResolvedValue(summary);
    vi.mocked(studySessionsApi.getActivity).mockResolvedValue(activity());

    renderWithProviders(<ProgressPage />);

    expect(await screen.findByRole("heading", { name: "My progress" })).toBeInTheDocument();
    expect(await screen.findByText("3 days")).toBeInTheDocument();
    expect(screen.getByText("Current streak")).toBeInTheDocument();
    expect(screen.getByText("Longest streak")).toBeInTheDocument();
    expect(screen.getByText("9 days")).toBeInTheDocument();
    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByText("80")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("5 sessions")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "3 sessions on Oct 21, daily quiz completed" })).toBeInTheDocument();
    expect(studySessionsApi.getActivity).toHaveBeenCalledWith(182);
    expect(screen.queryByTestId("guest-scope-note")).not.toBeInTheDocument();
    expect(screen.queryByTestId("signup-prompt")).not.toBeInTheDocument();
  });

  it("uses singular wording and a start-a-streak hint when there is no streak", async () => {
    vi.mocked(studySessionsApi.getSummary).mockResolvedValue({
      ...summary,
      totalSessions: 0,
      totalQuestions: 0,
      accuracyPercent: null,
      last30DaysSessions: 0,
      last30DaysAccuracyPercent: null,
    });
    vi.mocked(studySessionsApi.getActivity).mockResolvedValue(activity({ currentStreak: 0, longestStreak: 1, activity: [] }));

    renderWithProviders(<ProgressPage />);

    expect(await screen.findByText("1 day")).toBeInTheDocument();
    expect(screen.getByText("0 days")).toBeInTheDocument();
    expect(await screen.findByText("None yet")).toBeInTheDocument();
    expect(screen.getByText(/Complete a quiz or Learn session to start a streak/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Play the daily quiz" })).toHaveAttribute("href", "/daily");
  });

  it("notes that imported runs are unverified but counted, and that review activity is not", async () => {
    vi.mocked(studySessionsApi.getSummary).mockResolvedValue({ ...summary, importedSessions: 2 });
    vi.mocked(studySessionsApi.getActivity).mockResolvedValue(activity());

    renderWithProviders(<ProgressPage />);

    const note = await screen.findByText(/2 sessions were imported from this browser/);
    expect(note).toHaveTextContent(/unverified/);
    expect(note).toHaveTextContent(/do count/);
    expect(screen.getByText(/Review-queue answers and flashcard study are not counted yet/)).toBeInTheDocument();
  });

  it("offers a retry when loading fails", async () => {
    vi.mocked(studySessionsApi.getSummary).mockRejectedValue(new Error("boom"));
    vi.mocked(studySessionsApi.getActivity).mockRejectedValue(new Error("boom"));

    renderWithProviders(<ProgressPage />);

    expect(await screen.findByRole("alert", {}, { timeout: 4000 })).toHaveTextContent("Your progress could not be loaded.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("ProgressPage anonymous (route is public and shows a guest view)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("localStorage", installMemoryLocalStorage());
    resetGuestHistoryMemoryForTests();
    resetSignupPromptForTests();
    auth.isAuthenticated = false;
    auth.isLoading = false;
    auth.userId = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function seedGuestHistory() {
    const now = Date.now();
    const iso = (offsetDays: number) => new Date(now - offsetDays * 24 * 60 * 60 * 1000 - 60_000).toISOString();
    const summaries = [0, 1, 2, 6].map((offset, index) => ({
      runId: `run-${index}`,
      completedAt: iso(offset),
      correct: 3,
      total: 5,
      source: null,
      missedItemIds: [],
      mode: "quiz",
    }));
    localStorage.setItem(GUEST_HISTORY_STORAGE_KEY, JSON.stringify({ version: 2, summaries }));
  }

  it("builds the calendar from this browser, labels it, and never calls the API", async () => {
    seedGuestHistory();

    renderWithProviders(<ProgressPage />);

    expect(await screen.findByTestId("guest-scope-note")).toHaveTextContent("This browser only");
    expect(screen.getByRole("heading", { name: "Activity, this browser only" })).toBeInTheDocument();
    expect(screen.getByText("Quizzes in this browser")).toBeInTheDocument();
    expect(screen.getByText(/4 sessions on 4 days in the last 26 weeks/)).toBeInTheDocument();
    expect(studySessionsApi.getSummary).not.toHaveBeenCalled();
    expect(studySessionsApi.getActivity).not.toHaveBeenCalled();
  });

  it("shows the contextual signup prompt with a sign-up link that returns to /progress", async () => {
    renderWithProviders(<ProgressPage />);

    const prompt = await screen.findByTestId("signup-prompt");
    expect(prompt).toHaveAttribute("data-reason", "track-progress");
    const cta = screen.getByRole("link", { name: "Create a free account" });
    expect(cta.getAttribute("href")).toContain("/signup");
    await waitFor(() => expect(screen.getByText("No study sessions in the last 26 weeks.")).toBeInTheDocument());
  });

  it("renders neither view while auth is resolving", () => {
    auth.isLoading = true;
    renderWithProviders(<ProgressPage />);
    expect(screen.queryByRole("heading", { name: "My progress" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("guest-scope-note")).not.toBeInTheDocument();
  });
});
