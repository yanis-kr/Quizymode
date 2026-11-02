import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
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

  describe("boss fight", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const appliedAnswer = { itemId: "x", applied: true, graduated: false, intervalDays: 3, dueAt: "2026-10-21T00:00:00Z" };
    const queue = (dueCount: number, items = ids.map((id) => testItem(id))) => ({
      items,
      dueCount,
      totalCount: dueCount,
      nextDueAt: null,
    });

    beforeEach(() => {
      vi.mocked(reviewQueueApi.answer).mockResolvedValue(appliedAnswer);
      vi.mocked(reviewQueueApi.getSummary).mockResolvedValue({ dueCount: 0, totalCount: 5, nextDueAt: null });
    });

    const startBoss = async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Boss fight" }));
      await screen.findByRole("meter");
    };
    /** Answers the current question right or wrong, then moves on (or stays for the results after the last one). */
    const answer = (id: string, correct: boolean, last = false) => {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`${correct ? "Right" : "Wrong"} ${id}`) }));
      if (!last) fireEvent.click(screen.getByRole("button", { name: "Next" }));
    };

    it("can still be won when a question is skipped for an unavailable picture (#403)", async () => {
      const items = ids.map((id) => (id === "a" ? { ...testItem(id), questionImage: { key: "curated:flags/zz", altText: "Not bundled" } } : testItem(id)));
      vi.mocked(reviewQueueApi.get).mockResolvedValue(queue(5, items));
      renderWithProviders(<ReviewQueuePage />);
      await startBoss();

      fireEvent.click(await screen.findByRole("button", { name: "Skip question (not scored)" }));
      answer("b", true);
      answer("c", true);
      answer("d", true);
      answer("e", true, true);

      expect(await screen.findByRole("heading", { name: "Boss defeated!" })).toBeInTheDocument();
      expect(reviewQueueApi.answer).toHaveBeenCalledTimes(4);
    });

    it("offers a boss fight at 5 due and not at 4", async () => {
      vi.mocked(reviewQueueApi.get).mockResolvedValue(queue(4, ids.slice(0, 4).map((id) => testItem(id))));
      const first = renderWithProviders(<ReviewQueuePage />);
      await screen.findByRole("button", { name: /Right a/ });
      expect(screen.queryByRole("button", { name: "Boss fight" })).toBeNull();
      first.unmount();

      vi.mocked(reviewQueueApi.get).mockResolvedValue(queue(5));
      renderWithProviders(<ReviewQueuePage />);
      expect(await screen.findByText("5 due. Ready for a boss fight?")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Boss fight" })).toBeInTheDocument();
    });

    it("withdraws the offer once a normal answer is given", async () => {
      vi.mocked(reviewQueueApi.get).mockResolvedValue(queue(5));
      renderWithProviders(<ReviewQueuePage />);
      fireEvent.click(await screen.findByRole("button", { name: /Right a/ }));
      expect(screen.queryByRole("button", { name: "Boss fight" })).toBeNull();
    });

    it("starts with full HP, focuses the heading and lowers HP only on correct first answers", async () => {
      vi.mocked(reviewQueueApi.get).mockResolvedValue(queue(5));
      renderWithProviders(<ReviewQueuePage />);
      await startBoss();

      expect(screen.getByRole("heading", { name: "Boss fight" })).toHaveFocus();
      expect(screen.getByRole("meter", { name: "Boss HP 5 of 5" })).toHaveAttribute("aria-valuenow", "5");
      expect(screen.getByText("5 / 5 HP")).toBeInTheDocument();
      expect(screen.queryByText(/Showing/)).toBeNull();

      answer("a", true);
      expect(screen.getByRole("meter", { name: "Boss HP 4 of 5" })).toBeInTheDocument();
      expect(screen.getByText("Hit! Boss HP 4 of 5.")).toBeInTheDocument();
      answer("b", false);
      expect(screen.getByRole("meter", { name: "Boss HP 4 of 5" })).toBeInTheDocument();
      expect(screen.getByText("Missed. Boss HP 4 of 5.")).toBeInTheDocument();
    });

    it("says how many are due when more than the served set are", async () => {
      vi.mocked(reviewQueueApi.get).mockResolvedValue(queue(25));
      renderWithProviders(<ReviewQueuePage />);
      expect(await screen.findByText(/Showing 5 of 25 due questions/)).toBeInTheDocument();
      await startBoss();
      expect(screen.getByText("25 due, fighting 5")).toBeInTheDocument();
      expect(screen.queryByText(/Showing/)).toBeNull();
    });

    it("saves each first answer once with the same arguments as the normal review", async () => {
      vi.mocked(reviewQueueApi.get).mockResolvedValue(queue(5));
      const normal = renderWithProviders(<ReviewQueuePage />);
      fireEvent.click(await screen.findByRole("button", { name: /Right a/ }));
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      fireEvent.click(screen.getByRole("button", { name: /Wrong b/ }));
      await waitFor(() => expect(reviewQueueApi.answer).toHaveBeenCalledTimes(2));
      const normalCalls = vi.mocked(reviewQueueApi.answer).mock.calls.map((call) => [...call]);
      normal.unmount();
      vi.mocked(reviewQueueApi.answer).mockClear();

      renderWithProviders(<ReviewQueuePage />);
      await startBoss();
      answer("a", true);
      fireEvent.click(screen.getByRole("button", { name: /Wrong b/ }));
      await waitFor(() => expect(reviewQueueApi.answer).toHaveBeenCalledTimes(2));
      expect(vi.mocked(reviewQueueApi.answer).mock.calls.map((call) => [...call])).toEqual(normalCalls);
      expect(await screen.findByText("1 moved to a longer interval · 1 back tomorrow")).toBeInTheDocument();
    });

    it("defeats the boss, announces it, then shows when the next boss arrives; the results stay available", async () => {
      vi.mocked(reviewQueueApi.get).mockResolvedValue(queue(5));
      vi.mocked(reviewQueueApi.getSummary).mockResolvedValue({ dueCount: 0, totalCount: 5, nextDueAt: "2026-10-20T12:00:00Z" });
      renderWithProviders(<ReviewQueuePage />);
      await startBoss();
      ids.forEach((id, index) => answer(id, true, index === ids.length - 1));

      const outcome = await screen.findByRole("heading", { name: "Boss defeated!" });
      expect(outcome).not.toHaveFocus();
      expect(screen.queryByRole("meter")).toBeNull();
      expect(await screen.findByText(/^Next boss arrives .*2026/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "View results" }));
      expect(screen.getByRole("heading", { name: "Quiz complete" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Boss defeated!" })).toBeInTheDocument();
    });

    it("lets the boss escape and describes what is still due", async () => {
      vi.mocked(reviewQueueApi.get).mockResolvedValue(queue(5));
      vi.mocked(reviewQueueApi.getSummary).mockResolvedValue({ dueCount: 2, totalCount: 5, nextDueAt: null });
      renderWithProviders(<ReviewQueuePage />);
      await startBoss();
      ids.forEach((id, index) => answer(id, index < 3, index === ids.length - 1));

      expect(await screen.findByRole("heading", { name: "The boss escaped with 2 HP" })).toBeInTheDocument();
      expect(await screen.findByText("2 still due.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Boss fight" })).toBeNull();
      expect(screen.getAllByRole("link", { name: "Play the daily quiz" })[0]).toHaveAttribute("href", "/daily");
    });

    it("says no boss is scheduled when nothing is due and nothing is coming", async () => {
      vi.mocked(reviewQueueApi.get).mockResolvedValue(queue(5));
      renderWithProviders(<ReviewQueuePage />);
      await startBoss();
      ids.forEach((id, index) => answer(id, true, index === ids.length - 1));
      expect(await screen.findByText("No boss scheduled.")).toBeInTheDocument();
    });

    it("waits for slow saves before reading the summary", async () => {
      vi.mocked(reviewQueueApi.get).mockResolvedValue(queue(5));
      let finish: (value: typeof appliedAnswer) => void = () => {};
      vi.mocked(reviewQueueApi.answer).mockImplementation((itemId) =>
        itemId === "e" ? new Promise((resolve) => (finish = resolve)) : Promise.resolve(appliedAnswer),
      );
      renderWithProviders(<ReviewQueuePage />);
      await startBoss();
      ids.forEach((id, index) => answer(id, true, index === ids.length - 1));

      await screen.findByRole("heading", { name: "Boss defeated!" });
      expect(screen.getByText("Checking...")).toHaveAttribute("role", "status");
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(reviewQueueApi.getSummary).not.toHaveBeenCalled();

      await act(async () => finish(appliedAnswer));
      await waitFor(() => expect(reviewQueueApi.getSummary).toHaveBeenCalledTimes(1));
      expect(await screen.findByText("No boss scheduled.")).toBeInTheDocument();
    });

    it("drops the follow-up line quietly when the summary cannot be read", async () => {
      vi.mocked(reviewQueueApi.get).mockResolvedValue(queue(5));
      vi.mocked(reviewQueueApi.getSummary).mockRejectedValue(new Error("offline"));
      renderWithProviders(<ReviewQueuePage />);
      await startBoss();
      ids.forEach((id, index) => answer(id, true, index === ids.length - 1));
      await screen.findByRole("heading", { name: "Boss defeated!" });
      await waitFor(() => expect(reviewQueueApi.getSummary).toHaveBeenCalled());
      await waitFor(() => expect(screen.queryByText("Checking...")).toBeNull());
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("starts a rematch with fresh questions, full HP and a clean tally", async () => {
      vi.mocked(reviewQueueApi.get).mockResolvedValueOnce(queue(5));
      vi.mocked(reviewQueueApi.getSummary).mockResolvedValue({ dueCount: 6, totalCount: 6, nextDueAt: null });
      renderWithProviders(<ReviewQueuePage />);
      await startBoss();
      ids.forEach((id, index) => answer(id, true, index === ids.length - 1));
      expect(await screen.findByText("Another boss is ready now.")).toBeInTheDocument();

      const next = ["f", "g", "h", "i", "j"].map((id) => testItem(id));
      vi.mocked(reviewQueueApi.get).mockResolvedValue(queue(6, next));
      const outcomeCard = screen.getByRole("heading", { name: "Boss defeated!" }).parentElement!;
      fireEvent.click(within(outcomeCard).getByRole("button", { name: "Boss fight" }));

      expect(await screen.findByRole("meter", { name: "Boss HP 5 of 5" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Right f/ })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Boss defeated!" })).toBeNull();
      expect(screen.queryByText(/moved to a longer interval/)).toBeNull();
      expect(reviewQueueApi.get).toHaveBeenCalledTimes(2);
    });

    it("stays on the outcome when the rematch reload fails", async () => {
      // clearAllMocks keeps queued once-values from earlier tests; start from a clean mock.
      vi.mocked(reviewQueueApi.get).mockReset().mockResolvedValueOnce(queue(5));
      vi.mocked(reviewQueueApi.getSummary).mockResolvedValue({ dueCount: 6, totalCount: 6, nextDueAt: null });
      renderWithProviders(<ReviewQueuePage />);
      await startBoss();
      ids.forEach((id, index) => answer(id, true, index === ids.length - 1));
      expect(await screen.findByText("Another boss is ready now.")).toBeInTheDocument();

      vi.mocked(reviewQueueApi.get).mockRejectedValue(new Error("offline"));
      const outcomeCard = screen.getByRole("heading", { name: "Boss defeated!" }).parentElement!;
      fireEvent.click(within(outcomeCard).getByRole("button", { name: "Boss fight" }));

      // The page retries a failed load once (about 1 s) before giving up.
      await waitFor(() => expect(reviewQueueApi.get).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByRole("meter")).toBeNull(), { timeout: 4000 });
      expect(screen.queryByRole("button", { name: /Right a/ })).toBeNull();
    });

    it("ignores answers from Play again after the first run decided the outcome", async () => {
      vi.mocked(reviewQueueApi.get).mockResolvedValue(queue(5));
      renderWithProviders(<ReviewQueuePage />);
      await startBoss();
      ids.forEach((id, index) => answer(id, false, index === ids.length - 1));
      expect(await screen.findByRole("heading", { name: "The boss escaped with 5 HP" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "View results" }));
      fireEvent.click(screen.getByRole("button", { name: "Play again" }));
      fireEvent.click(await screen.findByRole("button", { name: /Right a/ }));

      expect(screen.getByRole("heading", { name: "The boss escaped with 5 HP" })).toBeInTheDocument();
      expect(screen.queryByRole("meter")).toBeNull();
    });
  });
});
