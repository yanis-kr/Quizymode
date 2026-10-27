import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import SortItPage from "./SortItPage";
import { itemsApi } from "@/api/items";
import { categoriesApi } from "@/api/categories";
import { collectionsApi } from "@/api/collections";
import { reviewQueueApi } from "@/api/learningLoop";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import { persistGameBest, readGameBest, resetGameBestForTests, sortItBestKey } from "../gameBest";
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

function makeItem(n: number, groupLabel: string | null, fact: string): ItemResponse {
  return {
    id: guid(n),
    category: "science",
    isPrivate: false,
    question: `Long question that is never shown ${n}?`,
    correctAnswer: fact,
    incorrectAnswers: [],
    explanation: "",
    createdAt: "2026-03-22T00:00:00Z",
    keywords: [],
    collections: [],
    groupLabel,
  };
}

/** `groupCount` groups of 4 items; the fact "<label>-<i>" belongs to the group <label>. */
function makeSortable(labels: string[]): ItemResponse[] {
  return labels.flatMap((label, g) =>
    Array.from({ length: 4 }, (_, i) => makeItem(g * 10 + i + 1, label, `${label.toLowerCase()}-${i}`)),
  );
}

function renderPage(path = "/games/sort-it/science") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const page = <SortItPage />;
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/games/sort-it/collections/:collectionId/:slug?" element={page} />
          <Route path="/games/sort-it/:category?" element={page} />
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
  await screen.findByRole("heading", { name: "Sort It" });
  await waitFor(() => expect(document.activeElement).not.toBe(document.body));
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
  return view;
}

/** The fact on the card, and the label of the group it belongs to. */
function currentFact(): string {
  return screen.getByRole("group").textContent ?? "";
}
function groupOf(fact: string): string {
  return fact.split("-")[0].replace(/^./, (c) => c.toUpperCase());
}
const buckets = (): HTMLElement[] => screen.getAllByRole("button", { name: /^\d\. / });
const bucket = (label: string): HTMLElement => buckets().find((button) => button.getAttribute("title") === label)!;
const pickRight = () => fireEvent.click(bucket(groupOf(currentFact())));
const pickWrong = () => {
  const right = groupOf(currentFact());
  fireEvent.click(buckets().find((button) => button.getAttribute("title") !== right)!);
};
const lives = (n: number): HTMLElement => screen.getByRole("img", { name: `${n} of 3 lives left` });
const trackedEvents = (name: string) => mockTrackEventOnce.mock.calls.filter(([, payload]) => payload.name === name);

describe("SortItPage", () => {
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
    vi.mocked(itemsApi.getRandom).mockResolvedValue({ items: makeSortable(["Mammals", "Birds", "Fish"]) } as never);
    vi.mocked(collectionsApi.getItems).mockResolvedValue({ items: makeSortable(["Mammals", "Birds"]) } as never);
    vi.mocked(collectionsApi.getById).mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", name: "Practice Set" } as never);
    vi.mocked(reviewQueueApi.enqueue).mockResolvedValue({ itemId: "x", intervalDays: 1, dueAt: "" });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("starting", () => {
    it("shows one numbered bucket per group in a 3-column grid, full lives, the hint and a focused card", async () => {
      await openPage();
      expect(buckets()).toHaveLength(3);
      buckets().forEach((button, index) => {
        expect(button).toHaveAttribute("aria-keyshortcuts", String(index + 1));
        expect(["Mammals", "Birds", "Fish"]).toContain(button.getAttribute("title"));
      });
      expect(buckets()[0].parentElement).toHaveClass("grid-cols-3");
      expect(lives(3)).toBeInTheDocument();
      expect(screen.getByText("Score 0")).toBeInTheDocument();
      expect(screen.getByText("Tap a group, or press 1, 2, 3.")).toBeInTheDocument();
      expect(document.activeElement).toBe(screen.getByRole("group"));
    });

    it("uses a two column grid for two groups and a 2x2 grid that widens for four", async () => {
      vi.mocked(itemsApi.getRandom).mockResolvedValue({ items: makeSortable(["Mammals", "Birds"]) } as never);
      const first = await openPage();
      expect(screen.getByText("Tap a group, or press 1, 2.")).toBeInTheDocument();
      expect(buckets()[0].parentElement).toHaveClass("grid-cols-2");
      first.unmount();
      vi.useRealTimers();

      vi.mocked(itemsApi.getRandom).mockResolvedValue({ items: makeSortable(["A", "B", "C", "D"]) } as never);
      await openPage();
      expect(screen.getByText("Tap a group, or press 1, 2, 3, 4.")).toBeInTheDocument();
      expect(buckets()[0].parentElement).toHaveClass("grid-cols-2", "sm:grid-cols-4");
    });

    it("keeps the first card still until the first input", async () => {
      await openPage();
      await fall(20000);
      expect(lives(3)).toBeInTheDocument();
      expect(trackedEvents("game_started")).toHaveLength(0);
    });

    it("shows the sortable-groups empty state when no two groups have four short items", async () => {
      vi.mocked(itemsApi.getRandom).mockResolvedValue({
        items: [...makeSortable(["Mammals"]), makeItem(50, null, "plain")],
      } as never);
      renderPage();
      expect(await screen.findByRole("heading", { name: "No sortable groups here" })).toBeInTheDocument();
      expect(screen.getByText("Sort It needs 2 to 4 groups with at least 4 short questions each.")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Open Quiz" })).toBeInTheDocument();
    });

    it("shows a retryable error when the roster fails to load", async () => {
      vi.mocked(itemsApi.getRandom).mockRejectedValueOnce(new Error("boom"));
      renderPage();
      expect(await screen.findByText("We couldn't load this game.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(await screen.findByRole("heading", { name: "Sort It" })).toBeInTheDocument();
    });

    it("loads a collection through getItems", async () => {
      renderPage("/games/sort-it/collections/11111111-1111-4111-8111-111111111111/practice+set");
      expect(await screen.findByRole("heading", { name: "Sort It" })).toBeInTheDocument();
      expect(collectionsApi.getItems).toHaveBeenCalled();
    });
  });

  describe("answering", () => {
    it("scores a tapped correct group, announces it and reports the start once with the deck size", async () => {
      await openPage();
      pickRight();
      expect(screen.getByText("Correct. Score 1.")).toBeInTheDocument();
      expect(screen.getByText("Score 1")).toBeInTheDocument();
      expect(trackedEvents("game_started")).toHaveLength(1);
      expect(trackedEvents("game_started")[0][1]).toMatchObject({
        runId: "run-1",
        total: 12,
        contextType: "game",
        contextId: "sort-it:category:science",
      });
    });

    it("loses a life on a wrong group, shows the right one and ignores further input", async () => {
      await openPage();
      const right = groupOf(currentFact());
      pickWrong();
      expect(screen.getByText(`Wrong. The group is ${right}. 2 lives left.`)).toBeInTheDocument();
      expect(lives(2)).toBeInTheDocument();
      expect(screen.getByRole("group")).toHaveTextContent(`Group: ${right}`);
      expect(bucket(right)).toHaveTextContent("Right answer");
      buckets().forEach((button) => expect(button).toHaveAttribute("aria-disabled", "true"));
      fireEvent.keyDown(window, { key: "1" });
      expect(lives(2)).toBeInTheDocument();
    });

    it("moves to the next card after about 800 ms and refocuses it", async () => {
      await openPage();
      const first = currentFact();
      pickRight();
      await advance(799);
      expect(currentFact()).toBe(first);
      await advance(1);
      expect(currentFact()).not.toBe(first);
      expect(document.activeElement).toBe(screen.getByRole("group"));
    });

    it("picks groups with the keys 1 to 3 and ignores higher digits", async () => {
      await openPage();
      fireEvent.keyDown(window, { key: "4" });
      fireEvent.keyDown(window, { key: "9" });
      expect(screen.getByText("Tap a group, or press 1, 2, 3.")).toBeInTheDocument();
      const index = buckets().findIndex((button) => button.getAttribute("title") === groupOf(currentFact()));
      fireEvent.keyDown(window, { key: String(index + 1) });
      expect(screen.getByText("Correct. Score 1.")).toBeInTheDocument();
    });

    it("ignores the keys with a modifier, while typing and when held down", async () => {
      await openPage();
      fireEvent.keyDown(window, { key: "1", ctrlKey: true });
      fireEvent.keyDown(window, { key: "2", repeat: true });
      const input = document.createElement("input");
      document.body.appendChild(input);
      fireEvent.keyDown(input, { key: "3" });
      input.remove();
      expect(screen.getByText("Tap a group, or press 1, 2, 3.")).toBeInTheDocument();
    });
  });

  describe("falling", () => {
    it("lets a card land after 6 s: a life is lost and the group shown", async () => {
      await openPage();
      pickRight();
      await advance(800);
      const right = groupOf(currentFact());
      await fall(100);
      await fall(5800);
      expect(lives(3)).toBeInTheDocument();
      await fall(200);
      expect(screen.getByText(`Too slow. The group is ${right}. 2 lives left.`)).toBeInTheDocument();
      expect(screen.getByRole("group")).toHaveTextContent(`Group: ${right}`);
      expect(bucket(right)).toHaveTextContent("Right answer");
    });
  });

  describe("game over", () => {
    async function loseThreeLives() {
      for (let i = 0; i < 3; i += 1) {
        pickWrong();
        await advance(800);
      }
    }

    it("ends after the third life, stores the best, reports completion once and lists misses with their group", async () => {
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
      expect(readGameBest(sortItBestKey("category:science|nav=|kw="))).toBe(2);
      expect(trackedEvents("game_completed")).toHaveLength(1);
      expect(trackedEvents("game_completed")[0][1]).toMatchObject({ runId: "run-1", score: 2, total: 5 });
      const misses = screen.getByRole("region", { name: "Misses" });
      expect(misses.textContent).toMatch(/(mammals|birds|fish)-\d/);
      expect(misses.textContent).toMatch(/Mammals|Birds|Fish/);
    });

    it("shows the stored best when it is not beaten and starts a fresh run on Play again", async () => {
      await openPage();
      persistGameBest(sortItBestKey("category:science|nav=|kw="), 9);
      await loseThreeLives();
      expect(screen.getByText("Best 9")).toBeInTheDocument();
      expect(screen.queryByText("New best!")).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Play again" }));
      expect(screen.getByRole("heading", { name: "Sort It" })).toBeInTheDocument();
      expect(lives(3)).toBeInTheDocument();
      expect(screen.getByText("Score 0")).toBeInTheDocument();
    });

    it("detaches the keys once the game is over", async () => {
      await openPage();
      await loseThreeLives();
      fireEvent.keyDown(window, { key: "1" });
      expect(screen.getByRole("heading", { name: "Game over" })).toBeInTheDocument();
    });
  });
});
