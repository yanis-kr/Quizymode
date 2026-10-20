import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import QuizModePage from "./QuizModePage";
import { itemsApi } from "@/api/items";
import { categoriesApi } from "@/api/categories";
import { keywordsApi } from "@/api/keywords";
import { collectionsApi } from "@/api/collections";
import { QUIZ_COMPLETED_EVENT, type QuizCompletionSnapshot } from "@/features/items/quiz/quizRun";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import {
  GUEST_HISTORY_STORAGE_KEY,
  readGuestHistory,
  resetGuestHistoryMemoryForTests,
} from "@/features/guestHistory/guestHistoryStorage";

const { mockTrackEventOnce, mockTrackEventDeferredOnce, mockFlushDeferredAnalyticsEvents } = vi.hoisted(() => ({
  mockTrackEventOnce: vi.fn(),
  mockTrackEventDeferredOnce: vi.fn(),
  mockFlushDeferredAnalyticsEvents: vi.fn(),
}));

vi.mock("@/features/analytics/analyticsEvents", () => ({
  trackEventOnce: mockTrackEventOnce,
  trackEventDeferredOnce: mockTrackEventDeferredOnce,
  flushDeferredAnalyticsEvents: mockFlushDeferredAnalyticsEvents,
}));

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: { isAuthenticated: true, userId: "user-1" as string | undefined },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

vi.mock("@/api/items", () => ({
  itemsApi: {
    getRandom: vi.fn(),
    getById: vi.fn(),
    getAll: vi.fn(),
  },
}));

vi.mock("@/api/categories", () => ({
  categoriesApi: {
    getAll: vi.fn(),
  },
}));

vi.mock("@/api/keywords", () => ({
  keywordsApi: {
    getKeywordDescriptions: vi.fn(),
  },
}));

vi.mock("@/api/collections", () => ({
  collectionsApi: {
    getItems: vi.fn(),
    getById: vi.fn(),
    getRating: vi.fn(),
  },
}));

vi.mock("@/components/CommentsDrawer", () => ({
  CommentsDrawer: () => null,
}));

vi.mock("@/components/ItemCollectionsModal", () => ({
  default: () => null,
}));

vi.mock("@/components/ItemRatingsComments", () => ({
  default: () => null,
}));

vi.mock("@/components/ItemCollectionControls", () => ({
  ItemCollectionControls: () => null,
}));

const item = {
  id: "item-1",
  category: "exams",
  isPrivate: false,
  question: "What is 2 + 2?",
  correctAnswer: "4",
  incorrectAnswers: ["1", "2", "3"],
  explanation: "Basic arithmetic.",
  createdAt: "2026-03-22T00:00:00Z",
  keywords: [],
  collections: [],
};

const secondItem = {
  ...item,
  id: "item-2",
  question: "What is the capital of France?",
  correctAnswer: "Paris",
  incorrectAnswers: ["Rome", "Berlin", "Madrid"],
  explanation: "Paris is the capital of France.",
};

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderPage(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/quiz/:category/item/:itemId"
            element={
              <>
                <QuizModePage />
                <LocationDisplay />
              </>
            }
          />
          <Route
            path="/quiz/collections/:collectionId/:slug/item/:itemId"
            element={
              <>
                <QuizModePage />
                <LocationDisplay />
              </>
            }
          />
          <Route
            path="/quiz/collections/:collectionId/:slug"
            element={
              <>
                <QuizModePage />
                <LocationDisplay />
              </>
            }
          />
          <Route path="/categories/:category/:kw1/:kw2" element={<LocationDisplay />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("QuizModePage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockAuth.isAuthenticated = true;
    mockAuth.userId = "user-1";
    installMemoryLocalStorage();
    resetGuestHistoryMemoryForTests();

    vi.mocked(categoriesApi.getAll).mockResolvedValue({
      categories: [{ category: "exams" }],
    } as Awaited<ReturnType<typeof categoriesApi.getAll>>);

    vi.mocked(itemsApi.getRandom).mockResolvedValue({
      items: [item],
    } as Awaited<ReturnType<typeof itemsApi.getRandom>>);

    vi.mocked(itemsApi.getAll).mockResolvedValue({
      items: [item],
      totalCount: 623,
      page: 1,
      pageSize: 1,
      totalPages: 623,
    } as Awaited<ReturnType<typeof itemsApi.getAll>>);

    vi.mocked(itemsApi.getById).mockResolvedValue(
      item as Awaited<ReturnType<typeof itemsApi.getById>>
    );

    vi.mocked(keywordsApi.getKeywordDescriptions).mockResolvedValue({
      keywords: [
        { description: "ACT exam" },
        { description: "Math section" },
      ],
    } as Awaited<ReturnType<typeof keywordsApi.getKeywordDescriptions>>);

    vi.mocked(collectionsApi.getItems).mockResolvedValue({
      items: [item, secondItem],
    } as Awaited<ReturnType<typeof collectionsApi.getItems>>);
    vi.mocked(collectionsApi.getById).mockResolvedValue({
      id: "collection-1",
      name: "Practice Set",
      description: "Two questions",
      itemCount: 2,
      createdBy: "user-1",
      createdAt: "2026-10-15T00:00:00Z",
      isPublic: true,
    } as Awaited<ReturnType<typeof collectionsApi.getById>>);
    vi.mocked(collectionsApi.getRating).mockResolvedValue({
      averageStars: null,
      count: 0,
      myStars: null,
    });
  });

  it("shows the shared leaf scope header and keeps Sets hidden in quiz mode", async () => {
    const user = userEvent.setup({ delay: null });

    renderPage(
      "/quiz/exams/item/item-1?nav=act,math&keywords=act,math,algebra"
    );

    expect(
      await screen.findByText(/Test your knowledge with interactive quizzes/i)
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/item count/i)).toHaveTextContent("(623)");
    expect(screen.getByRole("button", { name: "act" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "math" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "algebra" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: /sets/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /Quiz Mode/i })
    ).not.toBeInTheDocument();

    await waitFor(() =>
      expect(keywordsApi.getKeywordDescriptions).toHaveBeenCalledWith("exams", [
        "act",
        "math",
      ])
    );

    await waitFor(() =>
      expect(itemsApi.getAll).toHaveBeenCalledWith(
        "exams",
        undefined,
        ["algebra"],
        undefined,
        undefined,
        1,
        1,
        { navigationKeywords: ["act", "math"] }
      )
    );

    await user.click(screen.getByRole("tab", { name: /list/i }));

    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/categories/exams/act/math?view=items&keywords=algebra"
      )
    );
  });

  it("locks first answers, completes a collection, reviews mistakes, and replays", async () => {
    const user = userEvent.setup({ delay: null });
    const completions: QuizCompletionSnapshot[] = [];
    const onComplete = (event: Event) => {
      completions.push((event as CustomEvent<QuizCompletionSnapshot>).detail);
    };
    window.addEventListener(QUIZ_COMPLETED_EVENT, onComplete);

    renderPage("/quiz/collections/collection-1/practice+set/item/item-1");

    expect(await screen.findByText("What is 2 + 2?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /4/i }));
    expect(screen.getByText(/Correct Answer: 4/i)).toBeInTheDocument();
    expect(screen.getByText(/Score: 1 \/ 1 correct/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^next$/i }));
    expect(await screen.findByText("What is the capital of France?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Rome/i }));

    expect(screen.getByText(/You answered every question/i)).toBeInTheDocument();
    await waitFor(() => expect(completions).toHaveLength(1));
    expect(completions[0]).toMatchObject({ correct: 1, total: 2, missedItemIds: ["item-2"] });

    await user.click(screen.getByRole("button", { name: /view results/i }));
    expect(screen.getByRole("heading", { name: /quiz complete/i })).toHaveFocus();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByText(/50% correct · 1 missed/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /review mistakes/i }));
    expect(screen.getByRole("heading", { name: /review mistakes/i })).toHaveFocus();
    expect(screen.getByText(/Your answer:/i).closest("p")).toHaveTextContent("Rome");
    expect(screen.getByText(/Correct answer:/i).closest("p")).toHaveTextContent("Paris");
    expect(screen.getByText(/Paris is the capital of France/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /back to results/i }));
    await user.click(screen.getByRole("button", { name: /play again/i }));
    expect(await screen.findByText("What is 2 + 2?")).toBeInTheDocument();
    expect(screen.getByText(/Score: 0 \/ 0 correct/i)).toBeInTheDocument();
    expect(completions).toHaveLength(1);

    // Funnel telemetry (AC 5.4.9): one start and one completion for the run, then a new start for the replay.
    const telemetry = mockTrackEventOnce.mock.calls.map(([, input]) => input);
    expect(telemetry).toEqual([
      expect.objectContaining({ name: "quick_quiz_started", total: 2, contextType: "collection", contextId: "collection-1" }),
      expect.objectContaining({ name: "quiz_completed", score: 1, total: 2, contextType: "collection", contextId: "collection-1" }),
      expect.objectContaining({ name: "quick_quiz_started", total: 2 }),
    ]);
    expect(telemetry[1].runId).toBe(telemetry[0].runId);
    expect(telemetry[1].runId).toBe(completions[0].runId);
    expect(telemetry[2].runId).not.toBe(telemetry[0].runId);

    window.removeEventListener(QUIZ_COMPLETED_EVENT, onComplete);
  });

  it("records one anonymous completion in browser-local guest history and a replay adds one more", async () => {
    mockAuth.isAuthenticated = false;
    mockAuth.userId = undefined;
    const user = userEvent.setup({ delay: null });
    const view = renderPage("/quiz/collections/collection-1/practice+set/item/item-1");

    await user.click(await screen.findByRole("button", { name: /4/i }));
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    await user.click(await screen.findByRole("button", { name: /Rome/i }));
    await waitFor(() => expect(readGuestHistory()).toHaveLength(1));
    expect(readGuestHistory()[0]).toMatchObject({ correct: 1, total: 2 });
    // Non-GUID test identifiers are not persisted as practice sources or missed references.
    expect(readGuestHistory()[0]).toMatchObject({ source: null, missedItemIds: [] });
    expect(localStorage.getItem(GUEST_HISTORY_STORAGE_KEY)).not.toMatch(/What is|Paris|Rome/);

    // Remounting the completed run (reload restore) must not duplicate it.
    view.unmount();
    renderPage("/quiz/collections/collection-1/practice+set/item/item-2");
    await user.click(await screen.findByRole("button", { name: /view results/i }));
    expect(readGuestHistory()).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: /play again/i }));
    await user.click(await screen.findByRole("button", { name: /4/i }));
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    await user.click(await screen.findByRole("button", { name: /Paris/i }));
    await waitFor(() => expect(readGuestHistory()).toHaveLength(2));
  });

  it("never copies an authenticated completion into guest history", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage("/quiz/collections/collection-1/practice+set/item/item-1");

    await user.click(await screen.findByRole("button", { name: /4/i }));
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    await user.click(await screen.findByRole("button", { name: /Rome/i }));
    expect(await screen.findByText(/You answered every question/i)).toBeInTheDocument();
    expect(localStorage.getItem(GUEST_HISTORY_STORAGE_KEY)).toBeNull();
  });

  it("restores submitted feedback when navigating back without inflating score", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage("/quiz/collections/collection-1/practice+set/item/item-1");

    await user.click(await screen.findByRole("button", { name: /4/i }));
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    await user.click(screen.getByRole("button", { name: /Rome/i }));
    await user.click(screen.getByRole("button", { name: /^previous$/i }));

    expect(await screen.findByText("What is 2 + 2?")).toBeInTheDocument();
    expect(screen.getByText(/Correct Answer: 4/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /4/i })).toBeDisabled();
    expect(screen.getByText(/Score: 1 \/ 2 correct/i)).toBeInTheDocument();
  });

  it("restores a locked answer after reload", async () => {
    const user = userEvent.setup({ delay: null });
    const firstRender = renderPage("/quiz/collections/collection-1/practice+set/item/item-1");

    await user.click(await screen.findByRole("button", { name: /4/i }));
    expect(screen.getByText(/Correct Answer: 4/i)).toBeInTheDocument();
    firstRender.unmount();

    renderPage("/quiz/collections/collection-1/practice+set/item/item-1");
    expect(await screen.findByText(/Correct Answer: 4/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /4/i })).toBeDisabled();
    expect(screen.getByText(/Score: 1 \/ 1 correct/i)).toBeInTheDocument();
  });

  it("keeps an authenticated category quiz playable when storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked");
    });
    const user = userEvent.setup({ delay: null });

    renderPage("/quiz/exams/item/item-1?nav=act,math&keywords=act,math,algebra");
    await user.click(await screen.findByRole("button", { name: /4/i }));
    expect(screen.getByText(/You answered every question/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /view results/i }));
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /review mistakes/i })).not.toBeInTheDocument();
  });

  it("counts only the first answer during rapid submissions", async () => {
    renderPage("/quiz/exams/item/item-1?nav=act,math&keywords=act,math,algebra");
    const wrongAnswer = await screen.findByRole("button", { name: /1/i });
    const correctAnswer = screen.getByRole("button", { name: /4/i });

    act(() => {
      fireEvent.click(wrongAnswer);
      fireEvent.click(correctAnswer);
    });

    expect(screen.getByText(/Score: 0 \/ 1 correct/i)).toBeInTheDocument();
    expect(wrongAnswer).toBeDisabled();
    // AC 5.5.2: the first call carries the scored (wrong) answer. The deferred tracker's own
    // key-based dedupe (verified in analyticsEvents.test.tsx) drops any later call for the same item.
    expect(mockTrackEventDeferredOnce.mock.calls[0][1]).toMatchObject({
      name: "question_answered",
      itemId: "item-1",
      position: 1,
      isCorrect: false,
    });
  });

  it("flushes deferred analytics events when leaving the quiz", async () => {
    const { unmount } = renderPage(
      "/quiz/exams/item/item-1?nav=act,math&keywords=act,math,algebra"
    );
    await screen.findByText("What is 2 + 2?");
    mockFlushDeferredAnalyticsEvents.mockClear();

    unmount();

    expect(mockFlushDeferredAnalyticsEvents).toHaveBeenCalledTimes(1);
  });

  it("shows an empty state without completing an empty collection", async () => {
    vi.mocked(collectionsApi.getItems).mockResolvedValueOnce({ items: [] });
    renderPage("/quiz/collections/collection-1/practice+set");

    expect(await screen.findByText(/no playable quiz items/i)).toBeInTheDocument();
    expect(screen.queryByText(/quiz complete/i)).not.toBeInTheDocument();
  });

  it("leaves legacy unplayable items out of a collection quiz roster", async () => {
    // AC 3.6.17
    const legacy = { ...secondItem, id: "item-legacy", incorrectAnswers: ["  ", ""] };
    vi.mocked(collectionsApi.getItems).mockResolvedValueOnce({ items: [legacy, item] });
    renderPage("/quiz/collections/collection-1/practice+set");

    expect(await screen.findByText("What is 2 + 2?")).toBeInTheDocument();
    expect(screen.queryByText(legacy.question)).not.toBeInTheDocument();
  });

  it("shows the empty state when every collection item is unplayable", async () => {
    // AC 3.6.17
    const legacy = { ...item, incorrectAnswers: [] };
    vi.mocked(collectionsApi.getItems).mockResolvedValueOnce({ items: [legacy] });
    renderPage("/quiz/collections/collection-1/practice+set");

    expect(await screen.findByText(/no playable quiz items/i)).toBeInTheDocument();
  });

  it("shows No items found for a deep link to an unplayable item", async () => {
    // AC 3.6.17
    const legacy = { ...item, incorrectAnswers: [""] };
    vi.mocked(itemsApi.getById).mockResolvedValue(legacy as Awaited<ReturnType<typeof itemsApi.getById>>);
    vi.mocked(itemsApi.getRandom).mockResolvedValue({ items: [legacy] } as Awaited<
      ReturnType<typeof itemsApi.getRandom>
    >);
    vi.mocked(itemsApi.getAll).mockResolvedValue({
      items: [legacy],
      totalCount: 1,
      page: 1,
      pageSize: 1,
      totalPages: 1,
    } as Awaited<ReturnType<typeof itemsApi.getAll>>);
    renderPage("/quiz/exams/item/item-1");

    expect(await screen.findByText(/no items found/i)).toBeInTheDocument();
  });

  it("shows a retryable public browse route when a collection quiz fails", async () => {
    vi.mocked(collectionsApi.getItems).mockRejectedValueOnce(new Error("gone"));
    renderPage("/quiz/collections/collection-1/practice+set/item/item-1");

    expect(await screen.findByText(/collection quiz is unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /browse categories/i })).toHaveAttribute("href", "/categories");
  });
});
