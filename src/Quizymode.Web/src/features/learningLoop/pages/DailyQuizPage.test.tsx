import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { featuredApi } from "@/api/featured";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import { dailyQuizApi } from "@/api/learningLoop";
import { saveStudySession } from "@/features/studySessions/recordStudySession";
import { trackEventOnce } from "@/features/analytics/analyticsEvents";
import DailyQuizPage from "./DailyQuizPage";
import { readLocalReviewList } from "../localReviewList";
import { readDailyCompletions, utcToday } from "../localLearningState";
import { renderWithProviders, testItem } from "../learningLoopTestUtils";

const auth = vi.hoisted(() => ({ value: { isAuthenticated: false, isLoading: false, userId: null as string | null } }));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth.value }));
vi.mock("@/api/learningLoop", () => ({
  dailyQuizApi: { get: vi.fn(), complete: vi.fn() },
  interestsApi: { get: vi.fn().mockResolvedValue([]), popularCategories: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/api/studySessions", () => ({ studySessionsApi: { list: vi.fn().mockResolvedValue([]) } }));
vi.mock("@/api/featured", () => ({
  featuredApi: {
    get: vi.fn().mockResolvedValue({
      sets: [
        { id: "f1", displayName: "Guess the Flag", categorySlug: "geography", navKeyword1: "flags", navKeyword2: null, itemCount: 9, lastModifiedAt: null, sortOrder: 1 },
        { id: "f2", displayName: "Solar System Sprint", categorySlug: "science", navKeyword1: "space", navKeyword2: null, itemCount: 9, lastModifiedAt: null, sortOrder: 2 },
        { id: "f3", displayName: "Brain Teasers", categorySlug: "trivia", navKeyword1: null, navKeyword2: null, itemCount: 9, lastModifiedAt: null, sortOrder: 3 },
      ],
    }),
  },
}));
vi.mock("@/features/studySessions/recordStudySession", () => ({ saveStudySession: vi.fn().mockResolvedValue(true) }));
vi.mock("@/features/analytics/analyticsEvents", () => ({
  trackEventOnce: vi.fn(),
  trackEventDeferredOnce: vi.fn(),
  flushDeferredAnalyticsEvents: vi.fn(),
}));

const items = [testItem("a"), testItem("b")];
const explained = [
  { ...testItem("a"), explanation: "Because A." },
  { ...testItem("b"), explanation: "Because B." },
];

async function answerAll(correctIds: string[]) {
  for (const item of items) {
    const answer = correctIds.includes(item.id) ? item.correctAnswer : item.incorrectAnswers[0];
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(answer) }));
    if (item !== items[items.length - 1]) fireEvent.click(screen.getByRole("button", { name: "Next" }));
  }
  fireEvent.click(screen.getByRole("button", { name: "See my score" }));
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
    expect(screen.getByRole("heading", { name: "Daily quiz complete" })).toBeInTheDocument();
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
    expect(dailyQuizApi.complete).toHaveBeenCalledWith("2026-10-18", 1, 2, 0);
    await waitFor(() =>
      expect(saveStudySession).toHaveBeenCalledWith(expect.objectContaining({ source: null, correct: 1, total: 2, missedItemIds: ["a"] })),
    );
    expect(readDailyCompletions()).toEqual([]);
  });

  describe("guest review list (AC 3.14.14)", () => {
    const guidItems = [testItem("00000000-0000-4000-8000-000000000001"), testItem("00000000-0000-4000-8000-000000000002")];

    async function answerGuidItems(correctFirst: boolean) {
      for (const [index, item] of guidItems.entries()) {
        const answer = index === 0 && !correctFirst ? item.incorrectAnswers[0] : item.correctAnswer;
        fireEvent.click(await screen.findByRole("button", { name: new RegExp(answer) }));
        fireEvent.click(screen.getByRole("button", { name: index === guidItems.length - 1 ? "See my score" : "Next" }));
      }
    }

    it("a guest's misses from the counted run join the browser review list", async () => {
      vi.mocked(dailyQuizApi.get).mockResolvedValue({ date: "2026-10-18", items: guidItems, completion: null, streak: null });
      renderWithProviders(<DailyQuizPage />);
      await answerGuidItems(false);

      await screen.findByText(/Counted for today/);
      expect(readLocalReviewList().map((entry) => entry.itemId)).toEqual([guidItems[0]!.id]);
    });

    it("a practice run (already counted today) does not write to the list", async () => {
      vi.mocked(dailyQuizApi.get).mockResolvedValue({ date: "2026-10-18", items: guidItems, completion: null, streak: null });
      renderWithProviders(<DailyQuizPage />);
      await answerGuidItems(true);
      await screen.findByText(/Counted for today/);
      expect(readLocalReviewList()).toEqual([]);

      fireEvent.click(screen.getByRole("button", { name: "Practice again" }));
      await answerGuidItems(false);
      await screen.findByText(/Practice run/);
      expect(readLocalReviewList()).toEqual([]);
    });

    it("signed in: the browser list is not used", async () => {
      auth.value = { isAuthenticated: true, isLoading: false, userId: "user-1" };
      vi.mocked(dailyQuizApi.get).mockResolvedValue({ date: "2026-10-18", items: guidItems, completion: null, streak: 0 });
      vi.mocked(dailyQuizApi.complete).mockResolvedValue({
        created: true,
        streak: 1,
        completion: { correct: 1, total: 2, completedAt: "2026-10-18T10:00:00Z" },
      });
      renderWithProviders(<DailyQuizPage />);
      await answerGuidItems(false);

      await screen.findByText(/Counted for today/);
      expect(readLocalReviewList()).toEqual([]);
    });

    it("a sign-in during the run does not write the guest list", async () => {
      vi.mocked(dailyQuizApi.get).mockResolvedValue({ date: "2026-10-18", items: guidItems, completion: null, streak: null });
      const view = renderWithProviders(<DailyQuizPage />);
      fireEvent.click(await screen.findByRole("button", { name: new RegExp(guidItems[0]!.incorrectAnswers[0]!) }));
      auth.value = { isAuthenticated: true, isLoading: false, userId: "user-1" };
      vi.mocked(dailyQuizApi.complete).mockResolvedValue({
        created: true,
        streak: 1,
        completion: { correct: 1, total: 2, completedAt: "2026-10-18T10:00:00Z" },
      });
      view.rerender(<DailyQuizPage />);
      await answerGuidItems(false);

      await screen.findByText(/Counted for today/);
      expect(readLocalReviewList()).toEqual([]);
    });
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

  describe("unavailable pictures (#403)", () => {
    const brokenPicture = { key: "curated:flags/zz", altText: "Not bundled" };
    const pictureItems = [{ ...testItem("a"), questionImage: brokenPicture }, testItem("b")];

    it("signed in: skipping a question posts skipped, scores the rest and keeps the streak", async () => {
      auth.value = { isAuthenticated: true, isLoading: false, userId: "user-1" };
      vi.mocked(dailyQuizApi.get).mockResolvedValue({ date: "2026-10-18", items: pictureItems, completion: null, streak: 2 });
      vi.mocked(dailyQuizApi.complete).mockResolvedValue({
        created: true,
        streak: 3,
        completion: { correct: 1, total: 2, skipped: 1, completedAt: "2026-10-18T10:00:00Z" },
      });

      renderWithProviders(<DailyQuizPage />);
      expect(await screen.findByText("Picture isn't available")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Right a/ })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Skip question (not scored)" }));
      fireEvent.click(await screen.findByRole("button", { name: /Right b/ }));
      fireEvent.click(screen.getByRole("button", { name: "See my score" }));

      expect(await screen.findByText(/Counted for today · 3-day streak/)).toBeInTheDocument();
      expect(dailyQuizApi.complete).toHaveBeenCalledWith("2026-10-18", 1, 2, 1);
      expect(screen.getByText("1 / 1")).toBeInTheDocument();
      expect(screen.getByText("1 question skipped because the picture was unavailable. Not scored.")).toBeInTheDocument();
      await waitFor(() =>
        expect(saveStudySession).toHaveBeenCalledWith(expect.objectContaining({ correct: 1, total: 1, missedItemIds: [] })),
      );
    });

    it("signed in: skipping every question posts no completion or study session and awards no mastery", async () => {
      auth.value = { isAuthenticated: true, isLoading: false, userId: "user-1" };
      const allBroken = [
        { ...testItem("a"), questionImage: brokenPicture },
        { ...testItem("b"), questionImage: brokenPicture },
      ];
      vi.mocked(dailyQuizApi.get).mockResolvedValue({ date: "2026-10-18", items: allBroken, completion: null, streak: 0 });
      vi.mocked(dailyQuizApi.complete).mockResolvedValue({
        created: true,
        streak: 1,
        completion: { correct: 0, total: 2, skipped: 2, completedAt: "2026-10-18T10:00:00Z" },
      });

      renderWithProviders(<DailyQuizPage />);
      fireEvent.click(await screen.findByRole("button", { name: "Skip question (not scored)" }));
      fireEvent.click(await screen.findByRole("button", { name: "Skip question (not scored)" }));
      fireEvent.click(await screen.findByRole("button", { name: "View results" }));

      expect(await screen.findByText("No questions were scored")).toBeInTheDocument();
      expect(dailyQuizApi.complete).not.toHaveBeenCalled();
      expect(screen.queryByText(/Counted for today/)).not.toBeInTheDocument();
      expect(saveStudySession).not.toHaveBeenCalled();
    });

    it("anonymous: keeps skipped in the local completion record", async () => {
      vi.mocked(dailyQuizApi.get).mockResolvedValue({ date: "2026-10-18", items: pictureItems, completion: null, streak: null });

      renderWithProviders(<DailyQuizPage />);
      fireEvent.click(await screen.findByRole("button", { name: "Skip question (not scored)" }));
      fireEvent.click(await screen.findByRole("button", { name: /Right b/ }));
      fireEvent.click(screen.getByRole("button", { name: "See my score" }));

      await screen.findByText(/Counted for today/);
      expect(readDailyCompletions()).toEqual([{ date: "2026-10-18", correct: 1, total: 2, skipped: 1 }]);
    });

    it("reads No questions were scored on the done card when every question was skipped", async () => {
      auth.value = { isAuthenticated: true, isLoading: false, userId: "user-1" };
      vi.mocked(dailyQuizApi.get).mockResolvedValue({
        date: "2026-10-18",
        items,
        completion: { correct: 0, total: 2, skipped: 2, completedAt: "2026-10-18T09:00:00Z" },
        streak: 4,
      });
      renderWithProviders(<DailyQuizPage />);
      expect(await screen.findByText("Done for today. No questions were scored")).toBeInTheDocument();
      expect(screen.queryByText(/0 \/ 0/)).not.toBeInTheDocument();
    });

    it("shows the done card as correct out of scored questions with the skipped note", async () => {
      auth.value = { isAuthenticated: true, isLoading: false, userId: "user-1" };
      vi.mocked(dailyQuizApi.get).mockResolvedValue({
        date: "2026-10-18",
        items,
        completion: { correct: 1, total: 2, skipped: 1, completedAt: "2026-10-18T09:00:00Z" },
        streak: 4,
      });

      renderWithProviders(<DailyQuizPage />);

      expect(await screen.findByText("Done for today: 1 / 1")).toBeInTheDocument();
      expect(screen.getByText("1 question skipped because the picture was unavailable. Not scored.")).toBeInTheDocument();
    });
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

  it("shares the emoji grid in roster order and reports a daily share", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true, writable: true });
    vi.mocked(dailyQuizApi.get).mockResolvedValue({ date: "2026-10-18", items, completion: null, streak: null });

    renderWithProviders(<DailyQuizPage />);
    await answerAll(["a"]);
    fireEvent.click(await screen.findByRole("button", { name: "Share result" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    const expected = `Quizymode Daily 2026-10-18 1/2\n\u{1F7E9}\u{1F7E5}\n${window.location.origin}/daily?utm_source=share&utm_medium=share&utm_campaign=quiz_result&utm_content=daily`;
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expected));
    expect(screen.getByRole("button", { name: "Show QR code" })).toBeInTheDocument();
    await waitFor(() =>
      expect(trackEventOnce).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ name: "quiz_result_shared", contextType: "daily", contextId: "2026-10-18", score: 1, total: 2 }),
      ),
    );
  });

  describe("page copy (#649, #650)", () => {
    it("titles the page 'Daily quiz | Quizymode' once and drops the date and UTC from the header", async () => {
      vi.mocked(dailyQuizApi.get).mockResolvedValue({ date: "2026-10-18", items, completion: null, streak: null });
      renderWithProviders(<DailyQuizPage />);
      await screen.findByRole("region", { name: "Quiz" });
      await waitFor(() => expect(document.title).toBe("Daily quiz | Quizymode"));
      expect(screen.getByText("The same five questions for everyone today.")).toBeInTheDocument();
      expect(screen.queryByText(/2026-10-18/)).toBeNull();
      expect(screen.queryByText(/UTC|midnight/i)).toBeNull();
    });

    it("guest Sign up link carries the save-progress reason and returns to /daily", async () => {
      vi.mocked(dailyQuizApi.get).mockResolvedValue({ date: "2026-10-18", items, completion: null, streak: null });
      renderWithProviders(<DailyQuizPage />);
      expect(await screen.findByRole("link", { name: "Sign up" })).toHaveAttribute(
        "href",
        "/signup?reason=save-progress&returnTo=/daily",
      );
    });

    it("keeps the live region for 'Counted for today' mounted from the start", async () => {
      vi.mocked(dailyQuizApi.get).mockResolvedValue({ date: "2026-10-18", items, completion: null, streak: null });
      renderWithProviders(<DailyQuizPage />);
      const region = document.querySelector('div[aria-live="polite"]');
      expect(region).not.toBeNull();
      await screen.findByRole("region", { name: "Quiz" });
      expect(document.querySelector('div[aria-live="polite"]')).toBe(region);
      await answerAll(["a"]);
      expect(await screen.findByText(/Counted for today/)).toBeInTheDocument();
      expect(document.querySelector('div[aria-live="polite"]')).toBe(region);
    });
  });

  describe("answer feedback card (#648)", () => {
    beforeEach(() => {
      vi.mocked(dailyQuizApi.get).mockResolvedValue({ date: "2026-10-18", items: explained, completion: null, streak: null });
    });

    it("correct: one live region holds the card, with exactly one Next", async () => {
      renderWithProviders(<DailyQuizPage />);
      fireEvent.click(await screen.findByRole("button", { name: /Right a/ }));
      const card = screen.getByTestId("answer-feedback-card");
      expect(card).toHaveTextContent("Correct!");
      expect(card).toHaveTextContent("Answer: Right a");
      expect(card).toHaveTextContent("Did you know?");
      expect(card).toHaveTextContent("Because A.");
      expect(screen.getAllByRole("status").filter((node) => node.contains(card))).toHaveLength(1);
      expect(screen.getAllByRole("button", { name: "Next" })).toHaveLength(1);
    });

    it("incorrect: shows what was picked", async () => {
      renderWithProviders(<DailyQuizPage />);
      fireEvent.click(await screen.findByRole("button", { name: /Wrong a/ }));
      const card = screen.getByTestId("answer-feedback-card");
      expect(card).toHaveTextContent("Not quite.");
      expect(card).toHaveTextContent("You picked: Wrong a");
    });

    it("no explanation: no label", async () => {
      vi.mocked(dailyQuizApi.get).mockResolvedValue({ date: "2026-10-18", items, completion: null, streak: null });
      renderWithProviders(<DailyQuizPage />);
      fireEvent.click(await screen.findByRole("button", { name: /Right a/ }));
      expect(screen.queryByText("Did you know?")).toBeNull();
    });

    it("last question: See my score opens the results", async () => {
      renderWithProviders(<DailyQuizPage />);
      fireEvent.click(await screen.findByRole("button", { name: /Right a/ }));
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      fireEvent.click(await screen.findByRole("button", { name: /Right b/ }));
      expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "See my score" }));
      expect(await screen.findByRole("heading", { name: "Daily quiz complete" })).toBeInTheDocument();
    });
  });

  describe("result screen (#649)", () => {
    it("shows Review mistakes as the primary action, the countdown, three Explore next tiles and a secondary Practice again", async () => {
      vi.mocked(dailyQuizApi.get).mockResolvedValue({ date: utcToday(), items, completion: null, streak: null });
      renderWithProviders(<DailyQuizPage />);
      await answerAll(["a"]);

      expect(screen.getByRole("button", { name: "Review mistakes" })).toHaveClass("bg-indigo-600");
      expect(screen.getByText(/Next daily quiz in (\d+ h( \d+ min)?|\d+ min|less than a minute)\./)).toBeInTheDocument();
      expect(screen.queryByText(/UTC/)).toBeNull();
      const heading = await screen.findByRole("heading", { name: "Explore next" });
      const tiles = await waitFor(() => {
        const links = within(heading.parentElement as HTMLElement).getAllByRole("link");
        expect(links).toHaveLength(3);
        return links;
      });
      tiles.forEach((tile) => expect(tile.getAttribute("href")).toMatch(/size=5$/));
      expect(screen.getByRole("button", { name: "Practice again" })).toHaveClass("underline");
      expect(screen.queryByRole("button", { name: "Play again" })).toBeNull();
      expect(screen.getByRole("link", { name: "Browse categories" })).toBeInTheDocument();
    });

    it("renders the result without tiles when the lookup fails", async () => {
      vi.mocked(featuredApi.get).mockRejectedValueOnce(new Error("down"));
      vi.mocked(dailyQuizApi.get).mockResolvedValue({ date: utcToday(), items, completion: null, streak: null });
      renderWithProviders(<DailyQuizPage />);
      await answerAll(["a"]);
      expect(screen.getByRole("heading", { name: "Daily quiz complete" })).toBeInTheDocument();
      await waitFor(() => expect(screen.queryAllByTestId("explore-next-skeleton")).toHaveLength(0));
      expect(screen.queryByRole("heading", { name: "Explore next" })).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("replay after a counted run is practice and gives no second completion", async () => {
      vi.mocked(dailyQuizApi.get).mockResolvedValue({ date: utcToday(), items, completion: null, streak: null });
      renderWithProviders(<DailyQuizPage />);
      await answerAll(["a"]);
      expect(await screen.findByText(/Counted for today/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Practice again" }));
      await answerAll([]);
      expect(await screen.findByText(/Practice run: today's result was already counted/)).toBeInTheDocument();
      expect(readDailyCompletions()).toHaveLength(1);
    });
  });

  describe("done card countdown (#649)", () => {
    const done = { correct: 2, total: 2, completedAt: "2026-10-18T09:00:00Z" };

    it("shows the duration to the next quiz, with no UTC, and Explore next", async () => {
      auth.value = { isAuthenticated: true, isLoading: false, userId: "user-1" };
      vi.mocked(dailyQuizApi.get).mockResolvedValue({ date: utcToday(), items, completion: done, streak: 4 });
      renderWithProviders(<DailyQuizPage />);
      expect(
        await screen.findByText(/Next daily quiz in .+\. You can practice today's questions again; it won't change your score\./),
      ).toBeInTheDocument();
      expect(screen.queryByText(/UTC|Come back tomorrow/)).toBeNull();
      expect(await screen.findByRole("heading", { name: "Explore next" })).toBeInTheDocument();
    });

    it("at zero shows a ready message and Play today's quiz; nothing refetches until that button is pressed", async () => {
      auth.value = { isAuthenticated: true, isLoading: false, userId: "user-1" };
      // A quiz date well in the past: its reset moment has already passed.
      vi.mocked(dailyQuizApi.get).mockResolvedValueOnce({ date: "2026-10-18", items, completion: done, streak: 4 });
      renderWithProviders(<DailyQuizPage />);
      expect(await screen.findByText("A new daily quiz is ready.")).toBeInTheDocument();
      expect(screen.getByText("A new daily quiz is ready.").closest('[role="status"]')).not.toBeNull();
      expect(dailyQuizApi.get).toHaveBeenCalledTimes(1);

      vi.mocked(dailyQuizApi.get).mockResolvedValue({ date: "2026-10-19", items, completion: null, streak: 4 });
      fireEvent.click(screen.getByRole("button", { name: "Play today's quiz" }));
      expect(await screen.findByText("Question 1 of 2")).toBeInTheDocument();
      expect(dailyQuizApi.get).toHaveBeenCalledTimes(2);
    });
  });
});
