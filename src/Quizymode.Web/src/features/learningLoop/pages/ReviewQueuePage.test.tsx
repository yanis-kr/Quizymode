import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { reviewQueueApi } from "@/api/learningLoop";
import { trackEventOnce } from "@/features/analytics/analyticsEvents";
import ReviewQueuePage from "./ReviewQueuePage";
import { renderWithProviders, testItem } from "../learningLoopTestUtils";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ isAuthenticated: true, isLoading: false, userId: "user-1" }) }));
vi.mock("@/api/learningLoop", () => ({ reviewQueueApi: { get: vi.fn(), answer: vi.fn(), getSummary: vi.fn() } }));
vi.mock("@/features/analytics/analyticsEvents", () => ({
  trackEventOnce: vi.fn(),
  trackEventDeferredOnce: vi.fn(),
  flushDeferredAnalyticsEvents: vi.fn(),
}));

describe("ReviewQueuePage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves each first answer and reports how the schedule moved", async () => {
    const items = [testItem("a"), testItem("b")];
    vi.mocked(reviewQueueApi.get).mockResolvedValue({ items, dueCount: 25, totalCount: 30, nextDueAt: null });
    vi.mocked(reviewQueueApi.answer)
      .mockResolvedValueOnce({ itemId: "a", applied: true, graduated: false, intervalDays: 3, dueAt: "2026-10-21T00:00:00Z" })
      .mockResolvedValueOnce({ itemId: "b", applied: true, graduated: false, intervalDays: 1, dueAt: "2026-10-19T00:00:00Z" });

    renderWithProviders(<ReviewQueuePage />);

    expect(await screen.findByText(/Showing 2 of 25 due questions/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Right a/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: /Wrong b/ }));

    await waitFor(() => expect(screen.getByText("1 moved to a longer interval · 1 back tomorrow")).toBeInTheDocument());
    expect(reviewQueueApi.answer).toHaveBeenNthCalledWith(1, "a", true);
    expect(reviewQueueApi.answer).toHaveBeenNthCalledWith(2, "b", false);
    expect(trackEventOnce).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ name: "quick_quiz_started", contextType: "review" }));
  });

  it("tells the learner when an answer could not be saved", async () => {
    vi.mocked(reviewQueueApi.get).mockResolvedValue({ items: [testItem("a")], dueCount: 1, totalCount: 1, nextDueAt: null });
    vi.mocked(reviewQueueApi.answer).mockRejectedValue(new Error("offline"));

    renderWithProviders(<ReviewQueuePage />);
    fireEvent.click(await screen.findByRole("button", { name: /Right a/ }));

    expect(await screen.findByText("1 answer was not saved; it stays due.")).toBeInTheDocument();
  });

  it("shows when the next question is due when nothing is due now", async () => {
    vi.mocked(reviewQueueApi.get).mockResolvedValue({ items: [], dueCount: 0, totalCount: 3, nextDueAt: "2026-10-20T12:00:00Z" });

    renderWithProviders(<ReviewQueuePage />);

    expect(await screen.findByText("Nothing to review right now.")).toBeInTheDocument();
    expect(screen.getByText(/3 questions are scheduled. The next one is due/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Play the daily quiz" })).toHaveAttribute("href", "/daily");
  });

  it("shows results without a Share result button", async () => {
    vi.mocked(reviewQueueApi.get).mockResolvedValue({ items: [testItem("a")], dueCount: 1, totalCount: 1, nextDueAt: null });
    vi.mocked(reviewQueueApi.answer).mockResolvedValue({ itemId: "a", applied: true, graduated: false, intervalDays: 3, dueAt: "2026-10-21T00:00:00Z" });

    renderWithProviders(<ReviewQueuePage />);
    fireEvent.click(await screen.findByRole("button", { name: /Right a/ }));
    fireEvent.click(await screen.findByRole("button", { name: "View results" }));

    expect(screen.getByRole("heading", { name: "Quiz complete" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /share/i })).toBeNull();
  });
});
