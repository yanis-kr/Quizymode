import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import { collectionsApi } from "@/api/collections";
import { GuestHistoryCard } from "./GuestHistoryCard";
import {
  GUEST_HISTORY_STORAGE_KEY,
  recordGuestCompletion,
  resetGuestHistoryMemoryForTests,
} from "./guestHistoryStorage";
import type { QuizCompletionSnapshot } from "@/features/items/quiz/quizRun";

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: { isAuthenticated: false, isLoading: false },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

vi.mock("@/api/collections", () => ({
  collectionsApi: { getById: vi.fn() },
}));

const COLLECTION_ID = "8f9b8c14-8d30-4d94-9b20-4c7bb7f7f511";
const guest = { isAuthenticated: false, runIdentityKey: "guest", currentIdentityKey: "guest" };

function completion(overrides: Partial<QuizCompletionSnapshot> = {}): QuizCompletionSnapshot {
  return {
    runId: "run-1",
    scope: { kind: "collection", collectionId: COLLECTION_ID },
    completedAt: new Date(Date.now() - 60_000).toISOString(),
    correct: 4,
    total: 5,
    missedItemIds: ["00000000-0000-4000-8000-000000000001"],
    ...overrides,
  };
}

function renderCard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <GuestHistoryCard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("GuestHistoryCard", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = installMemoryLocalStorage();
    resetGuestHistoryMemoryForTests();
    mockAuth.isAuthenticated = false;
    mockAuth.isLoading = false;
    vi.mocked(collectionsApi.getById).mockResolvedValue({
      id: COLLECTION_ID,
      name: "Fun Trivia Facts",
    } as Awaited<ReturnType<typeof collectionsApi.getById>>);
  });

  afterEach(() => {
    // Vitest 3+ restoreAllMocks no longer clears vi.fn() call history.
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders nothing without history", () => {
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows exactly the latest result with practice and browse actions and local-only wording", async () => {
    recordGuestCompletion(completion({ runId: "older", completedAt: new Date(Date.now() - 120_000).toISOString(), correct: 1 }), guest);
    recordGuestCompletion(completion(), guest);
    recordGuestCompletion(completion(), guest);
    renderCard();

    expect(screen.getByRole("heading", { name: /your last quiz/i })).toBeInTheDocument();
    expect(screen.getByText(/4 \/ 5 correct/)).toBeInTheDocument();
    expect(screen.getByText(/1 missed/)).toBeInTheDocument();
    expect(screen.getByText(/saved in this browser only/i)).toBeInTheDocument();
    expect(screen.queryByText(/resume/i)).not.toBeInTheDocument();
    expect(await screen.findByText("Fun Trivia Facts")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /practice again/i })).toHaveAttribute(
      "href",
      `/quiz/collections/${COLLECTION_ID}`,
    );
    expect(screen.getByRole("link", { name: /browse topic/i })).toHaveAttribute(
      "href",
      `/collections/${COLLECTION_ID}/fun+trivia+facts`,
    );
  });

  it("opens Learn for a learn run and Quiz otherwise", async () => {
    recordGuestCompletion(completion({ mode: "learn" }), guest);
    renderCard();
    expect(await screen.findByRole("link", { name: /practice again/i })).toHaveAttribute(
      "href",
      `/learn/collections/${COLLECTION_ID}`,
    );
  });

  it("explains category practice is a new random set rather than an exact replay", () => {
    recordGuestCompletion(
      completion({
        scope: { kind: "category", category: "Exams", navigationKeywords: ["act"], filterKeywords: [], quizSize: 10 },
      }),
      guest,
    );
    renderCard();
    expect(screen.getByText(/new random set from this topic/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /practice again/i })).toHaveAttribute(
      "href",
      "/quiz/exams?nav=act&keywords=act",
    );
    expect(screen.getByRole("link", { name: /browse topic/i })).toHaveAttribute("href", "/categories/exams/act");
  });

  it("falls back to category browsing when the collection is deleted or private", async () => {
    vi.mocked(collectionsApi.getById).mockRejectedValue(new Error("404"));
    recordGuestCompletion(completion(), guest);
    renderCard();

    expect(await screen.findByText(/no longer available/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /practice again/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /browse categories/i })).toHaveAttribute("href", "/categories");
  });

  it("falls back to category browsing for invalid stored identifiers", () => {
    storage.setItem(
      GUEST_HISTORY_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        summaries: [
          {
            runId: "run-x",
            completedAt: new Date(Date.now() - 1000).toISOString(),
            correct: 1,
            total: 2,
            source: null,
            missedItemIds: [],
          },
        ],
      }),
    );
    renderCard();
    expect(screen.getByText(/1 \/ 2 correct/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /browse categories/i })).toBeInTheDocument();
    expect(collectionsApi.getById).not.toHaveBeenCalled();
  });

  it("is hidden while authenticated or while auth is loading, without deleting guest history", () => {
    recordGuestCompletion(completion(), guest);
    mockAuth.isAuthenticated = true;
    const { container, unmount } = renderCard();
    expect(container).toBeEmptyDOMElement();
    unmount();

    mockAuth.isAuthenticated = false;
    mockAuth.isLoading = true;
    const second = renderCard();
    expect(second.container).toBeEmptyDOMElement();
    expect(storage.getItem(GUEST_HISTORY_STORAGE_KEY)).not.toBeNull();
  });

  it("clears guest history with the keyboard and leaves other storage intact", async () => {
    const user = userEvent.setup({ delay: null });
    storage.setItem("quizymode.settings", "keep");
    recordGuestCompletion(completion(), guest);
    renderCard();

    screen.getByRole("button", { name: /clear guest history/i }).focus();
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("status")).toHaveTextContent(/cleared/i);
    expect(screen.queryByText(/your last quiz/i)).not.toBeInTheDocument();
    expect(storage.getItem(GUEST_HISTORY_STORAGE_KEY)).toBeNull();
    expect(storage.getItem("quizymode.settings")).toBe("keep");
  });

  it("reports a clear failure and keeps showing the stored result", async () => {
    const user = userEvent.setup({ delay: null });
    recordGuestCompletion(completion(), guest);
    vi.spyOn(storage, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderCard();

    await user.click(screen.getByRole("button", { name: /clear guest history/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/could not be cleared/i));
    expect(screen.getByText(/4 \/ 5 correct/)).toBeInTheDocument();
  });
});
