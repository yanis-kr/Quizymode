import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import QuizModePage from "./QuizModePage";
import { itemsApi } from "@/api/items";
import { categoriesApi } from "@/api/categories";
import { keywordsApi } from "@/api/keywords";
import { collectionsApi } from "@/api/collections";
import { resetStudyHotkeysPreferenceForTests } from "@/components/study/studyHotkeysPreference";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import { resetGuestHistoryMemoryForTests } from "@/features/guestHistory/guestHistoryStorage";

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

vi.mock("@/media/curatedImages", () => ({
  resolveCuratedImage: (key: string) => (key === "curated:flags/fr" ? "/assets/m/fr.webp" : null),
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

function renderPageWithEntries(initialEntries: string[]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  const page = (
    <>
      <QuizModePage />
      <LocationDisplay />
    </>
  );

  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/quiz/item/:itemId" element={page} />
          <Route path="/quiz/:category/item/:itemId" element={page} />
          <Route path="/quiz/collections/:collectionId/item/:itemId" element={page} />
          <Route path="/quiz/collections/:collectionId/:slug/item/:itemId" element={page} />
          <Route path="/quiz/collections/:collectionId/:slug" element={page} />
          <Route path="/categories/:category/:kw1/:kw2" element={<LocationDisplay />} />
          <Route path="/prev" element={<LocationDisplay />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...view, queryClient };
}

function press(init: KeyboardEventInit) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  });
}

const START = "/quiz/collections/collection-1/practice+set/item/item-1";

describe("QuizModePage keyboard shortcuts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockAuth.isAuthenticated = true;
    mockAuth.userId = "user-1";
    installMemoryLocalStorage();
    resetStudyHotkeysPreferenceForTests();
    resetGuestHistoryMemoryForTests();
    vi.mocked(categoriesApi.getAll).mockResolvedValue({ categories: [{ category: "exams" }] } as never);
    vi.mocked(itemsApi.getById).mockResolvedValue(item as never);
    vi.mocked(keywordsApi.getKeywordDescriptions).mockResolvedValue({ keywords: [] } as never);
    vi.mocked(collectionsApi.getItems).mockResolvedValue({ items: [item, secondItem] } as never);
    vi.mocked(collectionsApi.getById).mockResolvedValue({
      id: "collection-1",
      name: "Practice Set",
      description: "",
      itemCount: 2,
      createdBy: "user-1",
      createdAt: "2026-10-15T00:00:00Z",
      isPublic: true,
    } as never);
    vi.mocked(collectionsApi.getRating).mockResolvedValue({ averageStars: null, count: 0, myStars: null });
  });

  it("answers by key once, ignores a second key, and Enter then advances", async () => {
    renderPageWithEntries([START]);
    await screen.findByText("What is 2 + 2?");
    await screen.findByText("1 of 2");
    press({ key: "1", code: "Digit1" });
    expect(screen.getByText(/Score: [01] \/ 1 correct/)).toBeInTheDocument();
    press({ key: "b", code: "KeyB" });
    expect(screen.getByText(/\/ 1 correct/)).toBeInTheDocument();
    press({ key: "Enter", code: "Enter" });
    expect(await screen.findByText("What is the capital of France?")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("item-2");
  });

  describe("question picture gate (#403)", () => {
    const pictureItem = {
      ...item,
      questionImage: { key: "curated:flags/fr", altText: "Four stripes" },
    };
    const brokenItem = {
      ...secondItem,
      questionImage: { key: "curated:flags/zz", altText: "Not bundled" },
    };

    it("ignores 1-4 and A-D until the picture has loaded, then answers", async () => {
      vi.mocked(collectionsApi.getItems).mockResolvedValue({ items: [pictureItem, secondItem] } as never);
      vi.mocked(itemsApi.getById).mockResolvedValue(pictureItem as never);
      renderPageWithEntries([START]);
      await screen.findByText("What is 2 + 2?");
      await screen.findByText("1 of 2");

      press({ key: "1", code: "Digit1" });
      press({ key: "b", code: "KeyB" });
      expect(screen.getByText(/Score: 0 \/ 0 correct/)).toBeInTheDocument();
      expect(screen.queryByText(/Correct Answer:/)).not.toBeInTheDocument();

      fireEvent.load(await screen.findByAltText("Four stripes"));
      press({ key: "1", code: "Digit1" });
      expect(screen.getByText(/Score: [01] \/ 1 correct/)).toBeInTheDocument();
    });

    it("does nothing on 1, A or F while the zoom is open, so no answer is recorded", async () => {
      vi.mocked(collectionsApi.getItems).mockResolvedValue({ items: [pictureItem, secondItem] } as never);
      vi.mocked(itemsApi.getById).mockResolvedValue(pictureItem as never);
      renderPageWithEntries([START]);
      await screen.findByText("What is 2 + 2?");
      fireEvent.load(await screen.findByAltText("Four stripes"));
      fireEvent.click(screen.getByRole("button", { name: "Enlarge picture" }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      press({ key: "1", code: "Digit1" });
      press({ key: "a", code: "KeyA" });
      press({ key: "f", code: "KeyF" });

      expect(screen.getByText(/Score: 0 \/ 0 correct/)).toBeInTheDocument();
      expect(screen.queryByText(/Correct Answer:/)).not.toBeInTheDocument();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("keeps answers off for a picture that is not bundled, and Skip moves on without scoring", async () => {
      vi.mocked(collectionsApi.getItems).mockResolvedValue({ items: [brokenItem, item] } as never);
      vi.mocked(itemsApi.getById).mockResolvedValue(brokenItem as never);
      renderPageWithEntries(["/quiz/collections/collection-1/practice+set/item/item-2"]);
      await screen.findByText("What is the capital of France?");
      await screen.findByText("1 of 2");

      expect(screen.getByText("Picture isn't available")).toBeInTheDocument();
      press({ key: "1", code: "Digit1" });
      expect(screen.getByText(/Score: 0 \/ 0 correct/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Skip question (not scored)" }));

      expect(await screen.findByText("What is 2 + 2?")).toBeInTheDocument();
      expect(screen.getByText(/Score: 0 \/ 0 correct/)).toBeInTheDocument();
      press({ key: "1", code: "Digit1" });
      expect(await screen.findByText("You finished every question.")).toBeInTheDocument();
    });
  });

  it("arrows work while unanswered and mirror the disabled state", async () => {
    renderPageWithEntries([START]);
    await screen.findByText("What is 2 + 2?");
    await screen.findByText("1 of 2");
    press({ key: "ArrowLeft" });
    expect(screen.getByText("What is 2 + 2?")).toBeInTheDocument();
    press({ key: "ArrowRight" });
    expect(await screen.findByText("What is the capital of France?")).toBeInTheDocument();
    press({ key: "ArrowRight" });
    expect(screen.getByText("What is the capital of France?")).toBeInTheDocument();
    press({ key: "ArrowLeft" });
    expect(await screen.findByText("What is 2 + 2?")).toBeInTheDocument();
  });

  it("Enter after the last answer opens results but the right arrow never does", async () => {
    renderPageWithEntries([START]);
    await screen.findByText("What is 2 + 2?");
    await screen.findByText("1 of 2");
    press({ key: "1", code: "Digit1" });
    press({ key: "ArrowRight" });
    await screen.findByText("What is the capital of France?");
    press({ key: "1", code: "Digit1" });
    press({ key: "ArrowRight" });
    expect(screen.queryByRole("heading", { name: /quiz complete/i })).toBeNull();
    press({ key: "Enter", code: "Enter" });
    expect(await screen.findByRole("heading", { name: /quiz complete/i })).toBeInTheDocument();
  });

  it("is inert on the completion and mistakes views but ? opens the dialog", async () => {
    renderPageWithEntries([START]);
    await screen.findByText("What is 2 + 2?");
    await screen.findByText("1 of 2");
    // A deliberate miss, so Review mistakes exists.
    fireEvent.click(screen.getByRole("button", { name: /^[A-D]\. 1$/ }));
    press({ key: "ArrowRight" });
    await screen.findByText("What is the capital of France?");
    press({ key: "1", code: "Digit1" });
    press({ key: "Enter", code: "Enter" });
    await screen.findByRole("heading", { name: /quiz complete/i });
    const locationAtResults = screen.getByTestId("location").textContent;
    const summaryText = screen.getByText(/% correct/).textContent;
    expect(locationAtResults).toContain("item-2");

    const expectUntouched = () => {
      // Left arrow would navigate back to item-1 and digits or Enter would change the run if the gate were missing.
      expect(screen.getByTestId("location").textContent).toBe(locationAtResults);
      expect(document.querySelector("[aria-keyshortcuts]")).toBeNull();
    };
    press({ key: "1", code: "Digit1" });
    press({ key: "ArrowLeft" });
    press({ key: "ArrowRight" });
    press({ key: "Enter", code: "Enter" });
    expect(screen.getByRole("heading", { name: /quiz complete/i })).toBeInTheDocument();
    expect(screen.getByText(/% correct/).textContent).toBe(summaryText);
    expectUntouched();

    fireEvent.click(screen.getByRole("button", { name: /review mistakes/i }));
    expect(screen.getByRole("heading", { name: /review mistakes/i })).toBeInTheDocument();
    press({ key: "2", code: "Digit2" });
    press({ key: "ArrowLeft" });
    press({ key: "Enter", code: "Enter" });
    expect(screen.getByRole("heading", { name: /review mistakes/i })).toBeInTheDocument();
    expectUntouched();

    press({ key: "?" });
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    expect(screen.getByText("No other shortcuts on this screen.")).toBeInTheDocument();
  });

  it("keeps ? and digits inert while the Collection details overlay is open", async () => {
    renderPageWithEntries([START]);
    await screen.findByText("What is 2 + 2?");
    await screen.findByText("1 of 2");
    fireEvent.click(await screen.findByRole("button", { name: "Details" }));
    const overlay = screen.getByRole("dialog", { name: "Collection details" });
    expect(overlay).toHaveAttribute("aria-modal", "true");
    press({ key: "?" });
    press({ key: "1", code: "Digit1" });
    expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).toBeNull();
    expect(screen.getByText(/Score: 0 \/ 0 correct/)).toBeInTheDocument();
  });
});
