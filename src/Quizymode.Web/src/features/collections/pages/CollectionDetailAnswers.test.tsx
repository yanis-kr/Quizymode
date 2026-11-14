import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CollectionDetailPage from "./CollectionDetailPage";
import { collectionsApi } from "@/api/collections";
import { installMemoryLocalStorage } from "@/test/memoryStorage";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: false, isLoading: false }),
}));
vi.mock("@/api/studyPlans", () => ({ studyPlansApi: { list: vi.fn().mockResolvedValue([]), upsert: vi.fn(), remove: vi.fn() } }));
vi.mock("@/api/ratings", () => ({ ratingsApi: { getStats: vi.fn().mockResolvedValue({ averageStars: null, count: 0 }) } }));
vi.mock("@/hooks/useCurrentUserId", () => ({ useCurrentUserId: () => null }));
vi.mock("@/hooks/useListenAll", () => ({
  useListenAll: () => ({ listenState: "idle", handleButton: vi.fn(), isSupported: false }),
}));
vi.mock("@/components/ItemCollectionsModal", () => ({ default: () => null }));
vi.mock("@/components/ItemCollectionControls", () => ({ ItemCollectionControls: () => null }));
vi.mock("@/components/ItemRatingsComments", () => ({ default: () => null }));
vi.mock("../components/ShareCollectionButton", () => ({ ShareCollectionButton: () => null }));
vi.mock("@/api/collections", () => ({
  collectionsApi: {
    getById: vi.fn(),
    getItems: vi.fn(),
    getRating: vi.fn(),
    getBookmarkedBy: vi.fn(),
    listChildCollections: vi.fn(),
    listTopics: vi.fn(),
    removeItem: vi.fn(),
    update: vi.fn(),
    setRating: vi.fn(),
  },
}));

const makeItem = (id: string, question: string, correctAnswer: string) =>
  ({
    id,
    question,
    correctAnswer,
    incorrectAnswers: ["Wrong"],
    explanation: "",
    collections: [],
    keywords: [],
  }) as never;

function renderPage(search = "") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/collections/c1${search}`]}>
        <Routes>
          <Route path="/collections/:id" element={<CollectionDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function setup(items: unknown[]) {
  vi.mocked(collectionsApi.getById).mockResolvedValue({
    id: "c1",
    name: "Bio Set",
    description: "Cell biology basics",
    createdBy: "someone-else",
    createdAt: "2026-01-01T00:00:00Z",
    itemCount: items.length,
    isPublic: true,
    isDiscoverable: false,
  } as never);
  vi.mocked(collectionsApi.getRating).mockResolvedValue({ count: 0, averageStars: null, myStars: null } as never);
  vi.mocked(collectionsApi.getItems).mockResolvedValue({ items, totalCount: items.length } as never);
  vi.mocked(collectionsApi.listChildCollections).mockResolvedValue({ children: [], hiddenCollectionCount: 0 } as never);
  vi.mocked(collectionsApi.listTopics).mockResolvedValue([] as never);
}

describe("CollectionDetailPage hidden answers and landing header (#647, #646)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMemoryLocalStorage();
    setup([makeItem("1", "Cell powerhouse", "Mitochondria"), makeItem("2", "Plant pigment", "Chlorophyll")]);
  });

  it("hides every answer by default: the text is not in the DOM", async () => {
    renderPage();
    await screen.findByText("Cell powerhouse");
    expect(screen.queryByText(/Mitochondria/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Chlorophyll/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show answers" })).toHaveAttribute("aria-pressed", "false");
  });

  it("the page toggle reveals all answers, persists, and removes the per-item buttons", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();
    await screen.findByText("Cell powerhouse");
    expect(screen.getAllByRole("button", { name: "Show answer" })).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Show answers" }));
    expect(screen.getByRole("button", { name: /show answers/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Mitochondria/)).toBeInTheDocument();
    expect(screen.getByText(/Chlorophyll/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^(show|hide) answer$/i })).not.toBeInTheDocument();
    expect(window.localStorage.getItem("quizymode.list.show-answers.v1")).toBe("true");
  });

  it("a per-item reveal opens that one answer only and leaves the page toggle off", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();
    await screen.findByText("Cell powerhouse");

    await user.click(screen.getAllByRole("button", { name: "Show answer" })[0]);
    expect(screen.getByText(/Mitochondria/)).toBeInTheDocument();
    expect(screen.queryByText(/Chlorophyll/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show answers" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Hide answer" })).toBeInTheDocument();
  });

  it("honours a saved show choice and the ?showAnswers= override", async () => {
    window.localStorage.setItem("quizymode.list.show-answers.v1", "true");
    const first = renderPage();
    await screen.findByText("Cell powerhouse");
    expect(screen.getByText(/Mitochondria/)).toBeInTheDocument();
    first.unmount();

    renderPage("?showAnswers=false");
    await screen.findByText("Cell powerhouse");
    expect(screen.queryByText(/Mitochondria/)).not.toBeInTheDocument();
  });

  it("renders the collection landing header with Play quiz (N), Flashcards and Games and no Play 5/10", async () => {
    renderPage();
    const heading = await screen.findByRole("heading", { level: 1, name: "Bio Set" });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const header = heading.closest("[data-testid='scope-landing-header']") as HTMLElement;
    expect(within(header).getByText("2 questions")).toBeInTheDocument();
    expect(within(header).getByText("Cell biology basics")).toBeInTheDocument();
    expect(within(header).getByRole("link", { name: "Play quiz (2)" })).toHaveAttribute("href", "/quiz/collections/c1/bio+set");
    expect(within(header).getByRole("link", { name: "Flashcards" })).toHaveAttribute("href", "/explore/collections/c1/bio+set");
    expect(within(header).queryByRole("link", { name: "Play 5" })).not.toBeInTheDocument();
    expect(within(header).queryByRole("link", { name: "Play 10" })).not.toBeInTheDocument();
    // The two sample answers are too short for a game roster of three, so Games is omitted.
    expect(within(header).queryByRole("link", { name: "Games" })).not.toBeInTheDocument();
  });
});
