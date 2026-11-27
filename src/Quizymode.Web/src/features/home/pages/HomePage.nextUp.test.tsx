import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import HomePage from "./HomePage";
import { categoriesApi } from "@/api/categories";
import { collectionsApi } from "@/api/collections";
import { featuredApi } from "@/api/featured";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import {
  recordGuestCompletion,
  resetGuestHistoryMemoryForTests,
} from "@/features/guestHistory/guestHistoryStorage";
import { recordLocalDailyCompletion, utcToday } from "@/features/learningLoop/localLearningState";
import { addLocalReviewItems } from "@/features/learningLoop/localReviewList";

vi.mock("@/api/categories", () => ({ categoriesApi: { getAll: vi.fn() } }));
vi.mock("@/api/collections", () => ({ collectionsApi: { discover: vi.fn(), getById: vi.fn() } }));
vi.mock("@/api/featured", () => ({ featuredApi: { get: vi.fn() } }));
vi.mock("@/api/learningLoop", () => ({
  interestsApi: { popularCategories: vi.fn().mockResolvedValue([]), get: vi.fn(), replace: vi.fn() },
  dailyQuizApi: { get: vi.fn() },
  reviewQueueApi: { getSummary: vi.fn() },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: false, isLoading: false }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  );
}

const guest = { isAuthenticated: false, runIdentityKey: "guest", currentIdentityKey: "guest" };

function completeQuiz(): void {
  recordGuestCompletion(
    {
      runId: "run-1",
      scope: { kind: "category", category: "geography", navigationKeywords: ["flags"], filterKeywords: [] },
      completedAt: new Date(Date.now() - 60_000).toISOString(),
      correct: 3,
      total: 5,
      missedItemIds: [],
    } as never,
    guest,
  );
}

describe("HomePage Next up (#670, AC 3.31)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMemoryLocalStorage();
    resetGuestHistoryMemoryForTests();
    vi.mocked(categoriesApi.getAll).mockResolvedValue({ categories: [] });
    vi.mocked(collectionsApi.discover).mockResolvedValue({ items: [], totalCount: 0 });
    vi.mocked(featuredApi.get).mockResolvedValue({ sets: [], collections: [] });
  });

  it("AC 3.31.4 keeps the first-visit hero when no quiz was completed", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: /learn something new in five questions/i })).toBeInTheDocument();
    expect(screen.queryByTestId("next-up-card")).not.toBeInTheDocument();
  });

  it("AC 3.31.1 replaces the hero with one Next up card pointing at the Daily quiz", () => {
    completeQuiz();
    renderPage();
    const card = screen.getByTestId("next-up-card");
    expect(within(card).getByText("Next up")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: /play the daily quiz/i })).toHaveAttribute("href", "/daily");
    expect(within(card).getByRole("link", { name: "Play a game" })).toHaveAttribute("href", "/games");
    expect(screen.queryByRole("heading", { name: /learn something new in five questions/i })).not.toBeInTheDocument();
  });

  it("AC 3.0.36 shows the Fun expressions entry inside the Next up card", () => {
    completeQuiz();
    renderPage();
    const card = screen.getByTestId("next-up-card");
    expect(within(card).getByRole("link", { name: "Fun expressions" })).toHaveAttribute(
      "href",
      "/categories/languages?keywords=idioms,funny&view=items",
    );
  });

  it("AC 3.31.2 moves to saved mistakes once the Daily is done, then to the last topic", () => {
    completeQuiz();
    recordLocalDailyCompletion({ date: utcToday(), correct: 3, total: 5 });
    addLocalReviewItems(["00000000-0000-4000-8000-000000000001"]);
    const first = renderPage();
    expect(within(screen.getByTestId("next-up-card")).getByRole("link", { name: /review mistakes/i })).toHaveAttribute("href", "/review");
    first.unmount();

    localStorage.removeItem("quizymode.review.v1");
    renderPage();
    // AC 3.4.12 (#922): the topic choice speaks of topics and questions.
    expect(screen.getByTestId("next-up-card")).toHaveTextContent("Fresh questions from");
    expect(within(screen.getByTestId("next-up-card")).getByRole("link", { name: /play the next topic/i })).toHaveAttribute(
      "href",
      "/quiz/geography?nav=flags&keywords=flags",
    );
  });
});
