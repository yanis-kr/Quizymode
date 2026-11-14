import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CategoriesPage from "./CategoriesPage";
import { categoriesApi } from "@/api/categories";
import { keywordsApi } from "@/api/keywords";
import { itemsApi } from "@/api/items";
import { featuredApi } from "@/api/featured";
import { gamesApi } from "@/api/games";
import { installMemoryLocalStorage } from "@/test/memoryStorage";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: false, isLoading: false }),
}));
vi.mock("@/api/categories", () => ({ categoriesApi: { getAll: vi.fn() } }));
vi.mock("@/api/keywords", () => ({
  keywordsApi: {
    getNavigationKeywords: vi.fn(),
    getKeywordDescriptions: vi.fn(),
    getItemTagKeywords: vi.fn(),
  },
}));
vi.mock("@/api/items", () => ({ itemsApi: { getAll: vi.fn() } }));
vi.mock("@/api/featured", () => ({ featuredApi: { get: vi.fn() } }));
vi.mock("@/api/games", () => ({ gamesApi: { getRoster: vi.fn() } }));
vi.mock("@/api/ratings", () => ({
  ratingsApi: {
    getStats: vi.fn().mockResolvedValue({ averageStars: null, count: 0 }),
    getBulk: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock("@/hooks/useListenAll", () => ({
  useListenAll: () => ({ listenState: "idle", handleButton: vi.fn(), isSupported: false }),
}));
vi.mock("@/components/ItemRatingsComments", () => ({ default: () => null }));
vi.mock("@/components/ItemCollectionsModal", () => ({ default: () => null }));
vi.mock("@/components/ItemCollectionControls", () => ({ ItemCollectionControls: () => null }));

const makeItem = (id: string, question: string, answer: string) =>
  ({
    id,
    category: "Trivia",
    isPrivate: false,
    question,
    correctAnswer: answer,
    incorrectAnswers: ["x"],
    explanation: "",
    createdAt: "2026-01-01T00:00:00Z",
    keywords: [],
    collections: [],
  }) as never;

function renderAt(url: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/categories/:category/:kw1/:kw2" element={<CategoriesPage />} />
            <Route path="/categories/:category/:kw1" element={<CategoriesPage />} />
            <Route path="/categories/:category" element={<CategoriesPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

const LEAF = "/categories/trivia/brain-teasers/aha-moments";

describe("CategoriesPage landing header and hidden answers (#646, #647, #650)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMemoryLocalStorage();
    document.title = "";
    vi.mocked(categoriesApi.getAll).mockResolvedValue({
      categories: [{ category: "Trivia", count: 653, description: "Fun facts and puzzles.", averageRating: null }],
    } as never);
    vi.mocked(keywordsApi.getNavigationKeywords).mockResolvedValue({
      keywords: [{ name: "brain-teasers", itemCount: 33, averageRating: null, navigationRank: 1, description: null }],
    } as never);
    vi.mocked(keywordsApi.getKeywordDescriptions).mockResolvedValue({
      keywords: [
        { name: "brain-teasers", description: "Puzzles." },
        { name: "aha-moments", description: "Riddles with a twist." },
      ],
    } as never);
    vi.mocked(keywordsApi.getItemTagKeywords).mockResolvedValue({ names: [] });
    vi.mocked(featuredApi.get).mockResolvedValue({
      sets: [
        {
          id: "f1",
          displayName: "Aha! Brain Teasers",
          categorySlug: "trivia",
          navKeyword1: "brain-teasers",
          navKeyword2: "aha-moments",
          itemCount: 33,
          lastModifiedAt: null,
          sortOrder: 1,
        },
      ],
      collections: [],
    });
    vi.mocked(gamesApi.getRoster).mockResolvedValue({
      items: [makeItem("g1", "q", "a"), makeItem("g2", "q", "a"), makeItem("g3", "q", "a")],
      scopes: [],
    } as never);
    vi.mocked(itemsApi.getAll).mockImplementation(async (_c, _p, _k, _col, _r, _page, pageSize) => {
      const items = [makeItem("1", "Q one", "Answer one"), makeItem("2", "Q two", "Answer two")];
      return { items: pageSize === 1 ? items.slice(0, 1) : items, totalCount: 33, page: 1, pageSize, totalPages: 1 } as never;
    });
  });

  it("shows the Featured set title, description, unfiltered count and buttons in the List branch", async () => {
    renderAt(`${LEAF}?view=items`);

    const h1 = await screen.findByRole("heading", { level: 1, name: "Aha! Brain Teasers" });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const header = h1.closest("[data-testid='scope-landing-header']") as HTMLElement;
    expect(await within(header).findByText("33 questions")).toBeInTheDocument();
    expect(within(header).getByText("Riddles with a twist.")).toBeInTheDocument();
    expect(await within(header).findByRole("link", { name: "Games" })).toBeInTheDocument();
    expect(within(header).getByRole("link", { name: "Play 5" })).toHaveAttribute(
      "href",
      "/quiz/trivia?nav=brain-teasers%2Caha-moments&keywords=brain-teasers%2Caha-moments&size=5"
    );
    expect(within(header).getByRole("link", { name: "Play 10" })).toBeInTheDocument();
    // The scope path header does not repeat the count.
    expect(screen.queryByLabelText("Item count")).not.toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe("Aha! Brain Teasers | Quizymode"));
    // The count request is the unfiltered scope: page size 1, path keywords only.
    expect(itemsApi.getAll).toHaveBeenCalledWith("Trivia", undefined, undefined, undefined, undefined, 1, 1, {
      navigationKeywords: ["brain-teasers", "aha-moments"],
    });
  });

  it("keeps the unfiltered count when a search filter narrows the list", async () => {
    renderAt(`${LEAF}?view=items&search=one`);

    const heading = await screen.findByRole("heading", { level: 1 });
    const header = heading.closest("[data-testid='scope-landing-header']") as HTMLElement;
    expect(await within(header).findByText("33 questions")).toBeInTheDocument();
  });

  it("shows the header with a real count in the Sets branch, titled with the category name", async () => {
    renderAt("/categories/trivia");

    const h1 = await screen.findByRole("heading", { level: 1, name: "Trivia" });
    const header = h1.closest("[data-testid='scope-landing-header']") as HTMLElement;
    expect(await within(header).findByText("33 questions")).toBeInTheDocument();
    expect(within(header).getByText("Fun facts and puzzles.")).toBeInTheDocument();
    expect(within(header).getByRole("link", { name: "Play 5" })).toHaveAttribute("href", "/quiz/trivia?size=5");
    await waitFor(() => expect(document.title).toBe("Trivia | Quizymode"));
  });

  it("falls back to the keyword display name when no Featured set matches", async () => {
    vi.mocked(featuredApi.get).mockResolvedValue({ sets: [], collections: [] });
    renderAt("/categories/trivia/brain-teasers");

    await screen.findByRole("heading", { level: 1, name: "Brain Teasers" });
    await waitFor(() => expect(document.title).toBe("Brain Teasers | Quizymode"));
  });

  it("renders no header on the /categories index", async () => {
    renderAt("/categories");

    await screen.findByText(/Trivia/);
    expect(screen.queryByTestId("scope-landing-header")).not.toBeInTheDocument();
  });

  it("renders no header on the all-categories scope", async () => {
    renderAt("/categories/all?view=items");

    await screen.findByText("Browse across all categories");
    expect(screen.queryByTestId("scope-landing-header")).not.toBeInTheDocument();
  });

  it("hides answers by default in the List branch, reveals one, then all with the page toggle", async () => {
    const user = userEvent.setup({ delay: null });
    renderAt(`${LEAF}?view=items`);

    await screen.findByText("Q one");
    expect(screen.queryByText(/Answer one/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Answer two/)).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Show answer" })[0]);
    expect(screen.getByText(/Answer one/)).toBeInTheDocument();
    expect(screen.queryByText(/Answer two/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show answers" }));
    expect(screen.getByText(/Answer two/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show answers/i })).toHaveAttribute("aria-pressed", "true");
  });
});
