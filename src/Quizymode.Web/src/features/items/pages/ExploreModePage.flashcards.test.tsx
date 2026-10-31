import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import ExploreModePage from "./ExploreModePage";
import { collectionsApi } from "@/api/collections";
import { categoriesApi } from "@/api/categories";
import { itemsApi } from "@/api/items";
import { reviewQueueApi } from "@/api/learningLoop";
import { resetStudyHotkeysPreferenceForTests } from "@/components/study/studyHotkeysPreference";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import { resetFlashcardsShufflePreferenceForTests } from "@/features/items/flashcards/flashcardsShufflePreference";

const authState = vi.hoisted(() => ({ isAuthenticated: true }));
const analytics = vi.hoisted(() => ({
  runCounter: { n: 0 },
  trackFlashcardsStarted: vi.fn(),
  trackFlashcardGraded: vi.fn(),
  trackFlashcardRevealed: vi.fn(),
}));

vi.mock("@/features/analytics/analyticsEvents", () => ({
  createAnalyticsId: () => `run-${++analytics.runCounter.n}`,
  flushDeferredAnalyticsEvents: vi.fn(),
}));
vi.mock("@/features/items/quiz/quizAnalytics", () => ({
  flashcardsEventContext: () => ({ contextType: "collection", contextId: "col-1" }),
  trackFlashcardsStarted: analytics.trackFlashcardsStarted,
  trackFlashcardGraded: analytics.trackFlashcardGraded,
  trackFlashcardRevealed: analytics.trackFlashcardRevealed,
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: authState.isAuthenticated, isLoading: false }),
}));
vi.mock("@/api/items", () => ({ itemsApi: { getRandom: vi.fn(), getById: vi.fn() } }));
vi.mock("@/api/categories", () => ({ categoriesApi: { getAll: vi.fn() } }));
vi.mock("@/api/keywords", () => ({ keywordsApi: { getKeywordDescriptions: vi.fn() } }));
vi.mock("@/api/collections", () => ({
  collectionsApi: { getItems: vi.fn(), getById: vi.fn(), getRating: vi.fn() },
}));
vi.mock("@/api/learningLoop", () => ({ reviewQueueApi: { enqueue: vi.fn() } }));
vi.mock("@/components/CommentsDrawer", () => ({ CommentsDrawer: () => null }));
vi.mock("@/components/ItemCollectionsModal", () => ({ default: () => null }));
vi.mock("@/components/ItemRatingsComments", () => ({ default: () => null }));
vi.mock("@/components/ItemCollectionControls", () => ({ ItemCollectionControls: () => null }));

function makeItem(id: string) {
  return {
    id,
    category: "exams",
    isPrivate: false,
    question: `Question ${id}`,
    correctAnswer: `Answer ${id}`,
    incorrectAnswers: ["x", "y"],
    explanation: "",
    createdAt: "2026-03-22T00:00:00Z",
    keywords: [],
    collections: [],
  };
}

const IDS = ["a", "b", "c", "d"];

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderCollection(entry = "/explore/collections/col-1") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { queryClient, ...render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route
            path="/explore/collections/:collectionId/item/:itemId"
            element={
              <>
                <ExploreModePage />
                <LocationDisplay />
              </>
            }
          />
          <Route
            path="/explore/collections/:collectionId/:slug/item/:itemId"
            element={
              <>
                <ExploreModePage />
                <LocationDisplay />
              </>
            }
          />
          <Route
            path="/explore/collections/:collectionId"
            element={
              <>
                <ExploreModePage />
                <LocationDisplay />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  ) };
}

const currentCard = () => screen.getByTestId("location").textContent!.split("/item/")[1];
const flip = () => fireEvent.click(screen.getByRole("button", { name: "Show answer and explanation" }));
const grade = (name: "Got it" | "Still learning") => fireEvent.click(screen.getByRole("button", { name: name }));
const next = () => fireEvent.click(screen.getAllByRole("button", { name: /^(Next|Finish)$/ })[0]);

describe("ExploreModePage flashcards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analytics.runCounter.n = 0;
    authState.isAuthenticated = true;
    installMemoryLocalStorage();
    sessionStorage.clear();
    resetFlashcardsShufflePreferenceForTests();
    vi.mocked(collectionsApi.getItems).mockResolvedValue({ items: IDS.map(makeItem) } as never);
    vi.mocked(collectionsApi.getById).mockResolvedValue({
      id: "col-1",
      name: "Deck",
      createdBy: "me",
      createdAt: "2026-01-01T00:00:00Z",
      itemCount: 4,
      isPublic: true,
    } as never);
    vi.mocked(collectionsApi.getRating).mockResolvedValue({ averageStars: null, count: 0 } as never);
    vi.mocked(itemsApi.getById).mockImplementation(async (id: string) => makeItem(id) as never);
    vi.mocked(categoriesApi.getAll).mockResolvedValue({ categories: [] } as never);
    vi.mocked(reviewQueueApi.enqueue).mockResolvedValue({ itemId: "a", intervalDays: 1, dueAt: "" });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function start() {
    renderCollection();
    await screen.findByText("Question a");
    await waitFor(() => expect(currentCard()).toBe("a"));
  }

  it("reports a 1000-card deck and a position past 500 unclamped (AC 5.5.1, 5.5.16)", async () => {
    const ids = Array.from({ length: 1000 }, (_, index) => `card-${index + 1}`);
    vi.mocked(collectionsApi.getItems).mockResolvedValue({ items: ids.map(makeItem) } as never);
    renderCollection("/explore/collections/col-1/item/card-750");
    await screen.findByText("Question card-750");

    await waitFor(() => expect(analytics.trackFlashcardsStarted).toHaveBeenCalledWith("run-1", 1000, expect.anything()));
    flip();
    expect(analytics.trackFlashcardRevealed).toHaveBeenCalledWith("run-1", "card-750", 750, expect.anything());
  });

  it("does not call the review API for guests and leaves guest storage untouched", async () => {
    authState.isAuthenticated = false;
    const before = localStorage.getItem("quizymode.guest.v1");
    await start();
    flip();
    grade("Still learning");
    expect(screen.getByRole("button", { name: "Still learning" })).toHaveAttribute("aria-pressed", "true");
    expect(reviewQueueApi.enqueue).not.toHaveBeenCalled();
    expect(localStorage.getItem("quizymode.guest.v1")).toBe(before);
  });

  it("enqueues once per card for signed-in users and shows Added to Review", async () => {
    await start();
    flip();
    grade("Still learning");
    expect(await screen.findByRole("status")).toHaveTextContent("Added to Review");
    grade("Got it");
    grade("Still learning");
    expect(reviewQueueApi.enqueue).toHaveBeenCalledTimes(1);
    expect(reviewQueueApi.enqueue).toHaveBeenCalledWith("a");
    expect(analytics.trackFlashcardGraded).toHaveBeenCalledTimes(3);
  });

  it("makes one POST when the grade flips while the first call is pending, and never on Got it", async () => {
    let resolve!: (value: never) => void;
    vi.mocked(reviewQueueApi.enqueue).mockReturnValue(new Promise((r) => (resolve = r as never)) as never);
    await start();
    flip();
    grade("Got it");
    expect(reviewQueueApi.enqueue).not.toHaveBeenCalled();
    grade("Still learning");
    grade("Got it");
    grade("Still learning");
    expect(reviewQueueApi.enqueue).toHaveBeenCalledTimes(1);
    next();
    await waitFor(() => expect(currentCard()).toBe("b"));
    await act(async () => resolve({} as never));
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("shows a terminal message on 404 and a Retry on other failures", async () => {
    vi.mocked(reviewQueueApi.enqueue).mockRejectedValueOnce({ response: { status: 404 } });
    await start();
    flip();
    grade("Still learning");
    expect(await screen.findByText("This card can't be added to Review")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();

    next();
    await waitFor(() => expect(currentCard()).toBe("b"));
    vi.mocked(reviewQueueApi.enqueue).mockRejectedValueOnce({ response: { status: 500 } });
    flip();
    grade("Still learning");
    const retry = await screen.findByRole("button", { name: "Retry" });
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't add to Review. It stays in this session's pile.");
    fireEvent.click(retry);
    await waitFor(() => expect(reviewQueueApi.enqueue).toHaveBeenCalledTimes(3));
    expect(await screen.findByText("Added to Review")).toBeInTheDocument();
  });

  it("finishes with per-round counts, studies the pile, and restarts as a new run", async () => {
    await start();
    flip();
    grade("Got it");
    next();
    await waitFor(() => expect(currentCard()).toBe("b"));
    flip();
    grade("Still learning");
    next();
    await waitFor(() => expect(currentCard()).toBe("c"));
    next();
    await waitFor(() => expect(currentCard()).toBe("d"));
    flip();
    grade("Still learning");
    expect(screen.getAllByRole("button", { name: "Finish" }).length).toBeGreaterThan(0);
    next();

    expect(await screen.findByRole("heading", { name: "Deck complete" })).toHaveFocus();
    expect(screen.getByText("1 got it · 2 still learning · 1 not graded")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/item/d");

    fireEvent.click(screen.getByRole("button", { name: "Study 2 still-learning cards" }));
    await waitFor(() => expect(currentCard()).toBe("b"));
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    expect(screen.getByTestId("flashcard-front")).toBeInTheDocument();

    // Round counts start fresh; Finish both cards as got it.
    flip();
    grade("Got it");
    next();
    await waitFor(() => expect(currentCard()).toBe("d"));
    flip();
    grade("Got it");
    next();
    expect(await screen.findByRole("heading", { name: "Round complete" })).toBeInTheDocument();
    expect(screen.getByText("2 got it · 0 still learning · 0 not graded")).toBeInTheDocument();
    expect(screen.getByText("All caught up. Nice work.")).toBeInTheDocument();

    const startsBefore = analytics.trackFlashcardsStarted.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Restart deck" }));
    await waitFor(() => expect(currentCard()).toBe("a"));
    expect(screen.getByText("1 of 4")).toBeInTheDocument();
    await waitFor(() => expect(analytics.trackFlashcardsStarted.mock.calls.length).toBe(startsBefore + 1));
  });

  it("restarts on the front face with the only still-learning card being the last card", async () => {
    await start();
    next();
    await waitFor(() => expect(currentCard()).toBe("b"));
    next();
    await waitFor(() => expect(currentCard()).toBe("c"));
    next();
    await waitFor(() => expect(currentCard()).toBe("d"));
    flip();
    grade("Still learning");
    next();
    fireEvent.click(await screen.findByRole("button", { name: "Study 1 still-learning card" }));
    await waitFor(() => expect(screen.getByText("1 of 1")).toBeInTheDocument());
    expect(currentCard()).toBe("d");
    expect(screen.getByTestId("flashcard-front")).not.toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("shuffles only in collection scope, keeps the deep-linked card first and never reshuffles on Next", async () => {
    let tick = 0;
    vi.spyOn(Math, "random").mockImplementation(() => ((tick += 0.37) % 1));
    renderCollection("/explore/collections/col-1/item/c");
    await screen.findByText("Question c");
    expect(screen.getByRole("switch", { name: "Shuffle" })).toHaveAttribute("aria-checked", "false");

    fireEvent.click(screen.getByRole("switch", { name: "Shuffle" }));
    await waitFor(() => expect(screen.getByRole("switch", { name: "Shuffle" })).toHaveAttribute("aria-checked", "true"));
    expect(localStorage.getItem("quizymode.flashcards.shuffle.v1")).toBe("on");
    expect(currentCard()).toBe("c");
    expect(screen.getByText("1 of 4")).toBeInTheDocument();

    // Walking the deck visits each card exactly once, so Next never reshuffles.
    const seen = ["c"];
    for (let step = 2; step <= 4; step += 1) {
      next();
      await waitFor(() => expect(screen.getByText(`${step} of 4`)).toBeInTheDocument());
      seen.push(currentCard());
    }
    expect([...seen].sort()).toEqual(IDS);
  });

  it("asks before shuffling a graded run and Cancel changes nothing", async () => {
    await start();
    flip();
    grade("Got it");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("switch", { name: "Shuffle" }));
    expect(confirm).toHaveBeenCalled();
    expect(screen.getByRole("switch", { name: "Shuffle" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("button", { name: "Got it" })).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("quizymode.flashcards.shuffle.v1")).toBeNull();
  });

  it("starts shuffled from the saved preference, with the shuffled first card in the URL", async () => {
    localStorage.setItem("quizymode.flashcards.shuffle.v1", "on");
    vi.spyOn(Math, "random").mockReturnValue(0);
    renderCollection();
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/item/"));
    // Fisher-Yates with random()=0 rotates the deck: the first card is not "a".
    expect(currentCard()).not.toBe("a");
    expect(analytics.trackFlashcardsStarted).toHaveBeenCalledWith("run-1", 4, expect.anything());
  });

  it("keeps the other cards in the same order when a refetch removes one", async () => {
    localStorage.setItem("quizymode.flashcards.shuffle.v1", "on");
    let tick = 0;
    vi.spyOn(Math, "random").mockImplementation(() => ((tick += 0.37) % 1));
    const { queryClient } = renderCollection();
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/item/"));
    const order = [currentCard()];
    for (let step = 2; step <= 4; step += 1) {
      next();
      await waitFor(() => expect(screen.getByText(`${step} of 4`)).toBeInTheDocument());
      order.push(currentCard());
    }
    expect([...order].sort()).toEqual(IDS);

    const removed = order[2];
    vi.mocked(collectionsApi.getItems).mockResolvedValue({ items: IDS.filter((id) => id !== removed).map(makeItem) } as never);
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ["collectionItems"] });
    });
    await waitFor(() => expect(screen.getByText(/ of 3$/)).toBeInTheDocument());

    // Walk back to the start: the cards seen keep the survivors' relative order.
    const survivors = order.filter((id) => id !== removed);
    const walked: string[] = [currentCard()];
    for (;;) {
      const previous = screen.getAllByRole("button", { name: "Previous" })[0];
      if ((previous as HTMLButtonElement).disabled) break;
      const before = currentCard();
      fireEvent.click(previous);
      await waitFor(() => expect(currentCard()).not.toBe(before));
      walked.unshift(currentCard());
    }
    expect(walked).toEqual(survivors.slice(0, walked.length));
  });

  it("shows no Shuffle switch outside collection scope", async () => {
    vi.mocked(itemsApi.getRandom).mockResolvedValue({ items: IDS.map(makeItem) } as never);
    vi.mocked(categoriesApi.getAll).mockResolvedValue({ categories: [{ category: "exams" }] } as never);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/explore/exams/item/a"]}>
          <Routes>
            <Route path="/explore/:category/item/:itemId" element={<ExploreModePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    await screen.findByText("Question a");
    expect(screen.queryByRole("switch", { name: "Shuffle" })).toBeNull();
    expect(within(document.body).queryByText("Shuffle")).toBeNull();
  });

  describe("keyboard shortcuts", () => {
    const press = (init: KeyboardEventInit) =>
      act(() => {
        document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
      });

    beforeEach(() => {
      resetStudyHotkeysPreferenceForTests();
    });

    it("Space flips and fires the reveal, and Space again flips back", async () => {
      await start();
      press({ key: " ", code: "Space" });
      expect(analytics.trackFlashcardRevealed).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("flashcard-back")).not.toHaveAttribute("aria-hidden", "true");
      press({ key: "Enter", code: "Enter" });
      expect(screen.getByTestId("flashcard-front")).not.toHaveAttribute("aria-hidden", "true");
    });

    it("1 and 2 grade only after the card is flipped", async () => {
      await start();
      press({ key: "1", code: "Digit1" });
      expect(analytics.trackFlashcardGraded).not.toHaveBeenCalled();
      press({ key: " ", code: "Space" });
      press({ key: "2", code: "Digit2" });
      expect(screen.getByRole("button", { name: "Still learning" })).toHaveAttribute("aria-pressed", "true");
      expect(await screen.findByText("Added to Review")).toBeInTheDocument();
      press({ key: "1", code: "Digit1" });
      expect(screen.getByRole("button", { name: "Got it" })).toHaveAttribute("aria-pressed", "true");
    });

    it("arrows move between cards and the right arrow finishes on the last card", async () => {
      await start();
      press({ key: "ArrowLeft" });
      expect(currentCard()).toBe("a");
      press({ key: "ArrowRight" });
      await waitFor(() => expect(currentCard()).toBe("b"));
      press({ key: "ArrowRight" });
      await waitFor(() => expect(currentCard()).toBe("c"));
      press({ key: "ArrowRight" });
      await waitFor(() => expect(currentCard()).toBe("d"));
      press({ key: "ArrowRight" });
      expect(await screen.findByRole("heading", { name: "Deck complete" })).toBeInTheDocument();
    });

    it("only ? works on the summary and the dialog lists no other shortcuts", async () => {
      await start();
      for (let i = 0; i < 4; i += 1) press({ key: "ArrowRight" });
      await screen.findByRole("heading", { name: "Deck complete" });
      press({ key: " ", code: "Space" });
      press({ key: "ArrowLeft" });
      expect(screen.getByRole("heading", { name: "Deck complete" })).toBeInTheDocument();
      press({ key: "?" });
      expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
      expect(screen.getByText("No other shortcuts on this screen.")).toBeInTheDocument();
    });

    it("keeps ? and digits inert while the Collection details overlay is open", async () => {
      await start();
      fireEvent.click(screen.getByRole("button", { name: "Details" }));
      expect(screen.getByRole("dialog", { name: "Collection details" })).toHaveAttribute("aria-modal", "true");
      press({ key: "?" });
      press({ key: " ", code: "Space" });
      expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).toBeNull();
      expect(screen.getByTestId("flashcard-front")).not.toHaveAttribute("aria-hidden", "true");
    });

    it("the Shortcuts button opens the dialog even when single-key shortcuts are off", async () => {
      await start();
      fireEvent.click(screen.getByRole("button", { name: "Keyboard shortcuts" }));
      fireEvent.click(screen.getByRole("switch", { name: "Single-key shortcuts" }));
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      press({ key: " ", code: "Space" });
      press({ key: "?" });
      expect(screen.getByTestId("flashcard-front")).not.toHaveAttribute("aria-hidden", "true");
      expect(screen.queryByRole("dialog")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Keyboard shortcuts" }));
      expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    });
  });
});
