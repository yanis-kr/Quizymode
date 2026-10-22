import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import QuizModePage from "./QuizModePage";
import { itemsApi } from "@/api/items";
import { categoriesApi } from "@/api/categories";
import { keywordsApi } from "@/api/keywords";
import { collectionsApi } from "@/api/collections";
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

const START = "/quiz/collections/collection-1/practice+set/item/item-1";
const SECRET_NAME = "Practice Set";

function setNavigator(property: "clipboard" | "share", value: unknown) {
  Object.defineProperty(navigator, property, { value, configurable: true, writable: true });
}

function collectionResponse(extra: Record<string, unknown>) {
  return {
    id: "collection-1",
    name: SECRET_NAME,
    description: "",
    itemCount: 2,
    createdBy: "user-1",
    createdAt: "2026-10-15T00:00:00Z",
    ...extra,
  } as never;
}

async function finishRunAndOpenShare() {
  await screen.findByText("What is 2 + 2?");
  await screen.findByText("1 of 2");
  fireEvent.click(screen.getByRole("button", { name: /^[A-D]\. 4$/ }));
  fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
  await screen.findByText("What is the capital of France?");
  fireEvent.click(screen.getByRole("button", { name: /^[A-D]\. Rome$/ }));
  fireEvent.click(await screen.findByRole("button", { name: /view results/i }));
  fireEvent.click(await screen.findByRole("button", { name: "Share result" }));
}

describe("QuizModePage result sharing", () => {
  const writeText = vi.fn();
  const share = vi.fn();

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
    writeText.mockReset().mockResolvedValue(undefined);
    share.mockReset().mockResolvedValue(undefined);
    setNavigator("clipboard", { writeText });
    setNavigator("share", share);
    vi.mocked(categoriesApi.getAll).mockResolvedValue({ categories: [{ category: "exams" }] } as never);
    vi.mocked(itemsApi.getById).mockResolvedValue(item as never);
    vi.mocked(keywordsApi.getKeywordDescriptions).mockResolvedValue({ keywords: [] } as never);
    vi.mocked(collectionsApi.getItems).mockResolvedValue({ items: [item, secondItem] } as never);
    vi.mocked(collectionsApi.getRating).mockResolvedValue({ averageStars: null, count: 0, myStars: null });
  });

  it("a public collection shares its name and a campaign link, with a QR code", async () => {
    vi.mocked(collectionsApi.getById).mockResolvedValue(collectionResponse({ isPublic: true }));
    renderPageWithEntries([START]);
    await finishRunAndOpenShare();

    const text = (screen.getByRole("textbox") as HTMLTextAreaElement).value;
    expect(text).toContain('I scored 1/2 on "Practice Set" on Quizymode. Can you beat me?');
    expect(text).toContain("/quiz/collections/collection-1/practice+set?utm_source=share&utm_medium=share&utm_campaign=quiz_result&utm_content=collection");
    expect(screen.getByRole("button", { name: "Show QR code" })).toBeInTheDocument();
  });

  it.each([
    ["private", { isPublic: false }],
    ["missing visibility", {}],
  ])("a %s collection shares the score only and leaks no name, id or slug", async (_label, extra) => {
    vi.mocked(collectionsApi.getById).mockResolvedValue(collectionResponse(extra));
    renderPageWithEntries([START]);
    await finishRunAndOpenShare();

    expectNoLeak();
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("I scored 1/2 on a Quizymode quiz."));
    expect(writeText.mock.calls.flat().join(" ")).not.toMatch(/Practice|collection-1|practice\+set/);
    fireEvent.click(screen.getByRole("button", { name: /share via/i }));
    await waitFor(() => expect(share).toHaveBeenCalledWith({ text: "I scored 1/2 on a Quizymode quiz." }));
    expect(screen.queryByRole("button", { name: "Show QR code" })).toBeNull();
    expect(screen.getByText("Private collection: only your score is shared, with no link.")).toBeInTheDocument();
  });

  it("a collection that never loads shares the score only", async () => {
    vi.mocked(collectionsApi.getById).mockRejectedValue(new Error("down"));
    renderPageWithEntries([START]);
    await finishRunAndOpenShare();
    expectNoLeak();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("I scored 1/2 on a Quizymode quiz.");
  });
});

function expectNoLeak() {
  const dialog = screen.getByRole("dialog");
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).not.toMatch(/Practice|collection-1|practice\+set/);
  expect(dialog.textContent).not.toMatch(/Practice|collection-1|practice\+set/);
  expect(screen.getByRole("heading", { name: /share your result/i }).textContent).not.toMatch(/Practice/);
  expect(Array.from(dialog.querySelectorAll("[alt]")).map((el) => el.getAttribute("alt")).join(" ")).not.toMatch(/Practice/);
}
