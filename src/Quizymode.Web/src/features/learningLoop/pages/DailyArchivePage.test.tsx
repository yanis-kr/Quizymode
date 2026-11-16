import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import { dailyQuizApi } from "@/api/learningLoop";
import { trackEventOnce } from "@/features/analytics/analyticsEvents";
import DailyArchivePage from "./DailyArchivePage";
import { DailyArchiveLink } from "../DailyArchiveLink";
import { readDailyCompletions } from "../localLearningState";
import { readArchiveResults } from "../archiveLocalState";
import { renderWithProviders, testItem } from "../learningLoopTestUtils";

const auth = vi.hoisted(() => ({ value: { isAuthenticated: false, isLoading: false, userId: null as string | null } }));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth.value }));
vi.mock("@/api/learningLoop", () => ({
  dailyQuizApi: { archive: vi.fn(), getArchiveDay: vi.fn(), complete: vi.fn() },
}));
vi.mock("@/features/analytics/analyticsEvents", () => ({
  trackEventOnce: vi.fn(),
  trackEventDeferredOnce: vi.fn(),
  flushDeferredAnalyticsEvents: vi.fn(),
}));

const items = [testItem("a"), testItem("b")];

describe("DailyArchivePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMemoryLocalStorage();
    auth.value = { isAuthenticated: false, isLoading: false, userId: null };
  });

  it("D2: an archive run sends no completion request, leaves the streak alone and marks analytics as archive", async () => {
    vi.mocked(dailyQuizApi.archive).mockResolvedValue({ days: [{ date: "2026-11-18", total: 2, completion: null }] });
    vi.mocked(dailyQuizApi.getArchiveDay).mockResolvedValue({ date: "2026-11-18", items, completion: null, streak: null });

    renderWithProviders(<DailyArchivePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Play 2026-11-18" }));
    for (const item of items) {
      fireEvent.click(await screen.findByRole("button", { name: new RegExp(item.correctAnswer) }));
      if (item !== items[items.length - 1]) fireEvent.click(screen.getByRole("button", { name: "Next" }));
    }
    fireEvent.click(screen.getByRole("button", { name: "See my score" }));

    expect(await screen.findByText(/Quiz complete/i)).toBeInTheDocument();
    expect(dailyQuizApi.complete).not.toHaveBeenCalled();
    expect(readDailyCompletions()).toEqual([]);
    expect(trackEventOnce).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ name: "quiz_completed", contextType: "daily", contextId: "archive:2026-11-18", score: 2, total: 2 }),
    );
    expect(readArchiveResults()).toEqual([{ date: "2026-11-18", correct: 2, total: 2 }]);
  });

  it("#694: a guest archive score excludes skipped questions, like the daily screen", async () => {
    const brokenPicture = { key: "curated:flags/zz", altText: "Not bundled" };
    const pictureItems = [{ ...testItem("a"), questionImage: brokenPicture }, testItem("b")];
    vi.mocked(dailyQuizApi.archive).mockResolvedValue({ days: [{ date: "2026-11-18", total: 2, completion: null }] });
    vi.mocked(dailyQuizApi.getArchiveDay).mockResolvedValue({ date: "2026-11-18", items: pictureItems, completion: null, streak: null });

    renderWithProviders(<DailyArchivePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Play 2026-11-18" }));
    fireEvent.click(await screen.findByRole("button", { name: "Skip question (not scored)" }));
    fireEvent.click(await screen.findByRole("button", { name: /Right b/ }));
    fireEvent.click(screen.getByRole("button", { name: "See my score" }));
    await screen.findByText(/Quiz complete/i);

    expect(readArchiveResults()).toEqual([{ date: "2026-11-18", correct: 1, total: 1 }]);
    fireEvent.click(screen.getByRole("button", { name: "Back to the archive" }));
    expect(await screen.findByText("Played: 1 / 1")).toBeInTheDocument();
  });

  it("D3: guests see played or not played from this browser", async () => {
    window.localStorage.setItem(
      "quizymode.daily-archive.v1",
      JSON.stringify({ version: 1, results: [{ date: "2026-11-17", correct: 3, total: 5 }] }),
    );
    vi.mocked(dailyQuizApi.archive).mockResolvedValue({
      days: [
        { date: "2026-11-18", total: 5, completion: null },
        { date: "2026-11-17", total: 5, completion: null },
      ],
    });

    renderWithProviders(<DailyArchivePage />);

    expect(await screen.findByText("Played: 3 / 5")).toBeInTheDocument();
    expect(screen.getByText("Not played")).toBeInTheDocument();
  });

  it("D3: signed-in users see played or not played from their completions", async () => {
    auth.value = { isAuthenticated: true, isLoading: false, userId: "user-1" };
    vi.mocked(dailyQuizApi.archive).mockResolvedValue({
      days: [
        { date: "2026-11-18", total: 5, completion: { correct: 4, total: 5, completedAt: "2026-11-18T10:00:00Z" } },
        { date: "2026-11-17", total: 5, completion: null },
      ],
    });

    renderWithProviders(<DailyArchivePage />);

    expect(await screen.findByText("Played: 4 / 5")).toBeInTheDocument();
    expect(screen.getByText("Not played")).toBeInTheDocument();
  });

  it("D4: the entry point shows only when an archive set exists", async () => {
    vi.mocked(dailyQuizApi.archive).mockResolvedValueOnce({ days: [] });
    const empty = renderWithProviders(<DailyArchiveLink identityKey="guest" />);
    await vi.waitFor(() => expect(dailyQuizApi.archive).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("link", { name: /Play earlier daily quizzes/ })).not.toBeInTheDocument();
    empty.unmount();

    vi.mocked(dailyQuizApi.archive).mockResolvedValueOnce({ days: [{ date: "2026-11-18", total: 5, completion: null }] });
    renderWithProviders(<DailyArchiveLink identityKey="guest" />);
    expect(await screen.findByRole("link", { name: /Play earlier daily quizzes/ })).toHaveAttribute("href", "/daily/archive");
  });
});
