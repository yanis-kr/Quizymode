import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import BucketDropPage from "./BucketDropPage";
import { itemsApi } from "@/api/items";
import { categoriesApi } from "@/api/categories";
import { collectionsApi } from "@/api/collections";
import { reviewQueueApi } from "@/api/learningLoop";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import { bucketDropBestKey, readGameBest, resetGameBestForTests } from "../gameBest";
import type { ItemResponse } from "@/types/api";

const { mockTrackEventOnce, runCounter } = vi.hoisted(() => ({
  mockTrackEventOnce: vi.fn(),
  runCounter: { value: 0 },
}));

vi.mock("@/features/analytics/analyticsEvents", () => ({
  trackEventOnce: mockTrackEventOnce,
  createAnalyticsId: () => `run-${(runCounter.value += 1)}`,
}));
vi.mock("@/features/items/quiz/celebrate", () => ({ celebratePerfectScore: vi.fn() }));

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: { isAuthenticated: false, isLoading: false, userId: undefined as string | undefined },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mockAuth }));

vi.mock("@/api/items", () => ({ itemsApi: { getRandom: vi.fn(), getById: vi.fn() } }));
vi.mock("@/api/categories", () => ({ categoriesApi: { getAll: vi.fn() } }));
vi.mock("@/api/collections", () => ({ collectionsApi: { getItems: vi.fn(), getById: vi.fn() } }));
vi.mock("@/api/learningLoop", () => ({ reviewQueueApi: { enqueue: vi.fn() } }));

const guid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function makeItem(n: number, overrides: Partial<ItemResponse> = {}): ItemResponse {
  return {
    id: guid(n),
    category: "science",
    isPrivate: false,
    question: `Question number ${n}?`,
    correctAnswer: `right-${n}`,
    incorrectAnswers: [`wrong-${n}`, `other-${n}`, `third-${n}`],
    explanation: "",
    createdAt: "2026-03-22T00:00:00Z",
    keywords: [],
    collections: [],
    ...overrides,
  };
}
const makeItems = (count: number): ItemResponse[] => Array.from({ length: count }, (_, index) => makeItem(index + 1));

function renderPage(path = "/games/bucket-drop/science") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const page = <BucketDropPage />;
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/games/bucket-drop/collections/:collectionId/:slug?" element={page} />
          <Route path="/games/bucket-drop/:category?" element={page} />
          <Route path="/games/*" element={<div />} />
          <Route path="/quiz/*" element={<div />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// requestAnimationFrame is driven by hand so a test controls exactly how far a card has fallen.
const frames = new Map<number, FrameRequestCallback>();
let frameId = 0;
let frameClock = 0;

const fall = async (ms: number) => {
  await act(async () => {
    frameClock += ms;
    const due = [...frames.entries()];
    frames.clear();
    for (const [, callback] of due) callback(frameClock);
  });
};

const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

async function openPage(path?: string) {
  const view = renderPage(path);
  await screen.findByRole("heading", { name: "Bucket Drop" });
  // The initial focus runs in a passive effect; wait for it under real timers, or faking them can stall it.
  await waitFor(() => expect(document.activeElement).not.toBe(document.body));
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
  return view;
}

function questionN(): number {
  return Number(/(\d+)/.exec(screen.getByText(/^Question number \d+\?$/).textContent ?? "")![1]);
}
const bucket = (answer: string): HTMLElement => screen.getByRole("button", { name: new RegExp(`^\\d\\. ${answer}`) });
const buckets = (): HTMLElement[] => screen.getAllByRole("button", { name: /^\d\. / });
const pickRight = () => fireEvent.click(bucket(`right-${questionN()}`));
const pickWrong = () => fireEvent.click(bucket(`wrong-${questionN()}`));
const lives = (n: number): HTMLElement => screen.getByRole("img", { name: `${n} of 3 lives left` });
const trackedEvents = (name: string) => mockTrackEventOnce.mock.calls.filter(([, payload]) => payload.name === name);

/** Answers the waiting first card, then waits out the feedback so the next card is falling. */
async function startFalling() {
  pickRight();
  await advance(800);
}

describe("BucketDropPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runCounter.value = 0;
    installMemoryLocalStorage();
    resetGameBestForTests();
    frames.clear();
    frameClock = 0;
    window.requestAnimationFrame = (callback: FrameRequestCallback) => {
      frameId += 1;
      frames.set(frameId, callback);
      return frameId;
    };
    window.cancelAnimationFrame = (id: number) => {
      frames.delete(id);
    };
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    mockAuth.isAuthenticated = false;
    mockAuth.isLoading = false;
    vi.mocked(categoriesApi.getAll).mockResolvedValue({ categories: [{ category: "science" }] } as never);
    vi.mocked(itemsApi.getRandom).mockResolvedValue({ items: makeItems(8) } as never);
    vi.mocked(collectionsApi.getItems).mockResolvedValue({ items: makeItems(8) } as never);
    vi.mocked(collectionsApi.getById).mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", name: "Practice Set" } as never);
    vi.mocked(reviewQueueApi.enqueue).mockResolvedValue({ itemId: "x", intervalDays: 1, dueAt: "" });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  });

  describe("starting", () => {
    it("shows three numbered buckets, full lives, the hint and a focused question card", async () => {
      await openPage();
      expect(buckets()).toHaveLength(3);
      buckets().forEach((button, index) => {
        expect(button).toHaveAttribute("aria-keyshortcuts", String(index + 1));
        expect(button.getAttribute("title")).toMatch(/^(right|wrong|other|third)-\d+$/);
      });
      expect(lives(3)).toBeInTheDocument();
      expect(screen.getByText("Score 0")).toBeInTheDocument();
      expect(screen.getByText("Tap a bucket, or press 1, 2, 3.")).toBeInTheDocument();
      expect(document.activeElement).toBe(screen.getByRole("group"));
    });

    it("keeps the first card still until the first input", async () => {
      await openPage();
      await fall(20000);
      expect(lives(3)).toBeInTheDocument();
      expect(screen.getByText("Tap a bucket, or press 1, 2, 3.")).toBeInTheDocument();
      expect(trackedEvents("game_started")).toHaveLength(0);
    });

    it("shows the empty state when fewer than three items have two short distractors", async () => {
      vi.mocked(itemsApi.getRandom).mockResolvedValue({
        items: [makeItem(1), makeItem(2), makeItem(3, { incorrectAnswers: ["only-one"] }), makeItem(4, { incorrectAnswers: ["a"] })],
      } as never);
      renderPage();
      expect(await screen.findByRole("heading", { name: "Not enough short questions for games here" })).toBeInTheDocument();
    });

    it("shows a retryable error when the roster fails to load", async () => {
      vi.mocked(itemsApi.getRandom).mockRejectedValueOnce(new Error("boom"));
      renderPage();
      expect(await screen.findByText("We couldn't load this game.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(await screen.findByRole("heading", { name: "Bucket Drop" })).toBeInTheDocument();
    });

    it("loads a collection through getItems", async () => {
      renderPage("/games/bucket-drop/collections/11111111-1111-4111-8111-111111111111/practice+set");
      expect(await screen.findByRole("heading", { name: "Bucket Drop" })).toBeInTheDocument();
      expect(collectionsApi.getItems).toHaveBeenCalled();
    });
  });

  describe("answering", () => {
    it("scores a tapped correct bucket, announces it and reports the start once", async () => {
      await openPage();
      pickRight();
      expect(screen.getByText("Correct. Score 1.")).toBeInTheDocument();
      expect(screen.getByText("Score 1")).toBeInTheDocument();
      expect(lives(3)).toBeInTheDocument();
      expect(trackedEvents("game_started")).toHaveLength(1);
      expect(trackedEvents("game_started")[0][1]).toMatchObject({ runId: "run-1", total: 8, contextType: "game" });
      expect(screen.queryByText("Tap a bucket, or press 1, 2, 3.")).toBeNull();
    });

    it("loses a life on a wrong bucket, shows the right one and ignores further input", async () => {
      await openPage();
      const n = questionN();
      pickWrong();
      expect(screen.getByText("Wrong. 2 lives left.")).toBeInTheDocument();
      expect(lives(2)).toBeInTheDocument();
      expect(screen.getByRole("group")).toHaveTextContent(`Answer: right-${n}`);
      expect(bucket(`right-${n}`)).toHaveTextContent("Right answer");
      expect(bucket(`wrong-${n}`)).toHaveTextContent("Wrong");
      buckets().forEach((button) => expect(button).toHaveAttribute("aria-disabled", "true"));
      fireEvent.click(bucket(`other-${n}`));
      fireEvent.keyDown(window, { key: "1" });
      expect(lives(2)).toBeInTheDocument();
    });

    it("moves to the next card after about 800 ms", async () => {
      await openPage();
      const first = questionN();
      pickRight();
      await advance(799);
      expect(questionN()).toBe(first);
      await advance(1);
      expect(questionN()).not.toBe(first);
      expect(document.activeElement).toBe(screen.getByRole("group"));
    });

    it("picks buckets with the keys 1, 2 and 3", async () => {
      await openPage();
      const n = questionN();
      const index = buckets().findIndex((button) => button.getAttribute("title") === `right-${n}`);
      fireEvent.keyDown(window, { key: String(index + 1) });
      expect(screen.getByText("Correct. Score 1.")).toBeInTheDocument();
    });

    it("ignores the keys with a modifier, while typing and when held down", async () => {
      await openPage();
      fireEvent.keyDown(window, { key: "1", ctrlKey: true });
      fireEvent.keyDown(window, { key: "2", repeat: true });
      fireEvent.keyDown(window, { key: "4" });
      const input = document.createElement("input");
      document.body.appendChild(input);
      fireEvent.keyDown(input, { key: "3" });
      input.remove();
      expect(screen.getByText("Tap a bucket, or press 1, 2, 3.")).toBeInTheDocument();
    });

    it("picks by swipe: left bucket 1, down bucket 2, right bucket 3, up nothing", async () => {
      await openPage();
      const area = screen.getByRole("group").parentElement!.parentElement!;
      const swipe = (dx: number, dy: number) => {
        fireEvent.touchStart(area, { touches: [{ clientX: 200, clientY: 100 }] });
        fireEvent.touchEnd(area, { changedTouches: [{ clientX: 200 + dx, clientY: 100 + dy }] });
      };
      swipe(0, -120);
      swipe(20, 20);
      expect(screen.getByText("Tap a bucket, or press 1, 2, 3.")).toBeInTheDocument();

      const n = questionN();
      const index = buckets().findIndex((button) => button.getAttribute("title") === `right-${n}`);
      const [dx, dy] = [[-90, 0], [0, 90], [90, 0]][index];
      swipe(dx, dy);
      expect(screen.getByText("Correct. Score 1.")).toBeInTheDocument();
    });
  });

  describe("falling", () => {
    it("lets a card land after 6 s: a life is lost and the answer shown", async () => {
      await openPage();
      await startFalling();
      const n = questionN();
      await fall(100);
      await fall(5800);
      expect(lives(3)).toBeInTheDocument();
      await fall(200);
      expect(screen.getByText("Too slow. 2 lives left.")).toBeInTheDocument();
      expect(lives(2)).toBeInTheDocument();
      expect(screen.getByRole("group")).toHaveTextContent(`Answer: right-${n}`);
      expect(bucket(`right-${n}`)).toHaveTextContent("Right answer");
    });

    it("pauses while the tab is hidden: no frames run, then one late frame adds nothing", async () => {
      await openPage();
      await startFalling();
      await fall(100);
      await fall(1000);
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await fall(30000);
      expect(lives(3)).toBeInTheDocument();
      await fall(4000);
      expect(lives(3)).toBeInTheDocument();
      await fall(1100);
      expect(lives(2)).toBeInTheDocument();
    });

    it("applies only one outcome when a landing and a pick arrive in the same tick", async () => {
      await openPage();
      await startFalling();
      await fall(100);
      const n = questionN();
      await act(async () => {
        frameClock += 6000;
        const due = [...frames.values()];
        frames.clear();
        due.forEach((callback) => callback(frameClock));
        fireEvent.click(bucket(`right-${n}`));
      });
      expect(lives(2)).toBeInTheDocument();
      expect(screen.getByText("Score 1")).toBeInTheDocument();
    });

    it("speeds up by 15% after five correct answers", async () => {
      await openPage();
      pickRight();
      await advance(800);
      for (let i = 0; i < 4; i += 1) {
        pickRight();
        await advance(800);
      }
      expect(screen.getByText("Score 5")).toBeInTheDocument();
      await fall(100);
      await fall(4900);
      expect(lives(3)).toBeInTheDocument();
      await fall(200);
      expect(lives(2)).toBeInTheDocument();
    });

    it("answering a falling card stops it landing", async () => {
      await openPage();
      await startFalling();
      await fall(100);
      await fall(3000);
      pickRight();
      await fall(20000);
      expect(lives(3)).toBeInTheDocument();
      expect(screen.getByText("Score 2")).toBeInTheDocument();
    });
  });

  describe("reduced motion", () => {
    it("keeps the card still, shows a time bar and still times out", async () => {
      vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduced-motion") }));
      const { container } = await openPage();
      await startFalling();
      const bar = container.querySelector("[data-low]") as HTMLElement;
      expect(bar).not.toBeNull();
      const wrapper = screen.getByRole("group").parentElement as HTMLElement;
      await fall(100);
      await fall(3000);
      expect(wrapper.style.transform).toBe("");
      expect(bar.style.width).toBe("50%");
      await fall(2900);
      expect(bar.dataset.low).toBe("true");
      expect(lives(3)).toBeInTheDocument();
      await fall(100);
      expect(lives(2)).toBeInTheDocument();
    });

    it("moves the card when motion is allowed", async () => {
      await openPage();
      await startFalling();
      const wrapper = screen.getByRole("group").parentElement as HTMLElement;
      await fall(100);
      await fall(3000);
      expect(wrapper.style.transform).toMatch(/^translateY\(/);
    });
  });

  describe("game over", () => {
    async function loseThreeLives() {
      for (let i = 0; i < 3; i += 1) {
        pickWrong();
        await advance(800);
      }
    }

    it("ends after the third life, stores the best and reports completion once", async () => {
      await openPage();
      pickRight();
      await advance(800);
      pickRight();
      await advance(800);
      await loseThreeLives();

      expect(screen.getByRole("heading", { name: "Game over" })).toBeInTheDocument();
      expect(screen.getByText("2 of 5 right")).toBeInTheDocument();
      expect(screen.getByText("New best!")).toBeInTheDocument();
      expect(screen.getByText("Game over. Score 2. New best!")).toBeInTheDocument();
      expect(readGameBest(bucketDropBestKey("category:science|nav=|kw="))).toBe(2);
      expect(trackedEvents("game_completed")).toHaveLength(1);
      expect(trackedEvents("game_completed")[0][1]).toMatchObject({ runId: "run-1", score: 2, total: 5 });
      expect(screen.getByRole("heading", { name: "Misses" })).toBeInTheDocument();
    });

    it("shows the stored best when it is not beaten and starts a fresh run on Play again", async () => {
      await openPage();
      const key = bucketDropBestKey("category:science|nav=|kw=");
      const { persistGameBest } = await import("../gameBest");
      persistGameBest(key, 9);
      await loseThreeLives();
      expect(screen.getByText("Best 9")).toBeInTheDocument();
      expect(screen.queryByText("New best!")).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Play again" }));
      expect(screen.getByRole("heading", { name: "Bucket Drop" })).toBeInTheDocument();
      expect(lives(3)).toBeInTheDocument();
      expect(screen.getByText("Score 0")).toBeInTheDocument();
    });

    it("announces no lives left when the last life goes", async () => {
      await openPage();
      pickWrong();
      await advance(800);
      pickWrong();
      await advance(800);
      pickWrong();
      expect(screen.getByText("Wrong. No lives left.")).toBeInTheDocument();
    });
  });
});
