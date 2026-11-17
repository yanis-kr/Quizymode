import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
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


describe("Active filters (#664)", () => {
  const START = "/categories/languages/german/idioms?view=items&keywords=funny";

  function LocationProbe() {
    const location = useLocation();
    return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
  }

  function renderWithLocation(url: string) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[url]}>
            <LocationProbe />
            <Routes>
              <Route path="/categories/:category/:kw1/:kw2" element={<CategoriesPage />} />
              <Route path="/categories/:category/:kw1" element={<CategoriesPage />} />
              <Route path="/categories/:category" element={<CategoriesPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </HelmetProvider>
    );
  }

  const currentUrl = () => {
    const url = new URL(screen.getByTestId("location").textContent ?? "", "http://x");
    const parts = ["view", "page", "keywords"]
      .filter((k) => url.searchParams.has(k))
      .map((k) => `${k}=${url.searchParams.get(k)}`);
    return `${url.pathname}?${parts.join("&")}`;
  };

  const itemWithKeywords = (keywords: string[]) =>
    ({
      ...(makeItem("1", "Q one", "Answer one") as object),
      category: "Languages",
      keywords: keywords.map((name, i) => ({ id: `k${i}`, name, isPrivate: false })),
    }) as never;

  beforeEach(() => {
    vi.clearAllMocks();
    installMemoryLocalStorage();
    vi.mocked(categoriesApi.getAll).mockResolvedValue({
      categories: [{ category: "Languages", count: 10, description: "Languages", averageRating: null }],
    } as never);
    vi.mocked(keywordsApi.getNavigationKeywords).mockResolvedValue({ keywords: [] } as never);
    vi.mocked(keywordsApi.getKeywordDescriptions).mockResolvedValue({ keywords: [] } as never);
    vi.mocked(keywordsApi.getItemTagKeywords).mockResolvedValue({ names: [] });
    vi.mocked(featuredApi.get).mockResolvedValue({ sets: [], collections: [] });
    vi.mocked(gamesApi.getRoster).mockResolvedValue({ items: [], scopes: [] } as never);
    vi.mocked(itemsApi.getAll).mockImplementation(
      async (_c, _p, _k, _col, _r, _page, pageSize) =>
        ({
          items: [itemWithKeywords(["german", "idioms", "funny"])],
          totalCount: 1,
          page: 1,
          pageSize,
          totalPages: 1,
        }) as never
    );
  });

  it("AC 3.5.8 lists path keywords then tags as removable chips", async () => {
    renderWithLocation(START);
    const group = await screen.findByRole("group", { name: "Active filters" });
    const names = within(group)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(["Remove filter german", "Remove filter idioms", "Remove filter funny"]);
  });

  it("AC 3.5.8 shows no chip row on the sets view", async () => {
    renderWithLocation("/categories/languages");
    await screen.findByRole("heading", { level: 1, name: "Languages" });
    expect(screen.queryByRole("group", { name: "Active filters" })).not.toBeInTheDocument();
  });

  it.each([
    ["german", "/categories/languages?view=items&page=1&keywords=idioms,funny"],
    ["idioms", "/categories/languages/german?view=items&page=1&keywords=funny"],
    ["funny", "/categories/languages/german/idioms?view=items&page=1"],
  ])("AC 3.5.9 removing %s navigates to the demoted scope", async (name, expected) => {
    const user = userEvent.setup({ delay: null });
    renderWithLocation(START);
    await user.click(await screen.findByRole("button", { name: `Remove filter ${name}` }));
    await waitFor(() => expect(currentUrl()).toBe(expected));
  });

  it("AC 3.5.10 shows path and tag keywords as pressed and ignores clicks on a path keyword", async () => {
    const user = userEvent.setup({ delay: null });
    renderWithLocation(START);
    await screen.findByText("Q one");
    expect(screen.getByRole("button", { name: "german", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "funny", pressed: true })).toBeInTheDocument();

    const before = currentUrl();
    await user.click(screen.getByRole("button", { name: "idioms", pressed: true }));
    expect(currentUrl()).toBe(before);
  });

  it("AC 3.5.11 shows the empty state and Clear tag filters keeps the path", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(itemsApi.getAll).mockResolvedValue({
      items: [],
      totalCount: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    } as never);
    renderWithLocation(START);
    expect(await screen.findByText("No items match all filters")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear tag filters" }));
    await waitFor(() => expect(currentUrl()).toBe("/categories/languages/german/idioms?view=items&page=1"));
  });
});

describe("Category filters (#707)", () => {
  const START = "/categories/languages/german/idioms?view=items&keywords=funny";

  function LocationProbe() {
    const location = useLocation();
    return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
  }

  function renderWithLocation(url: string) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[url]}>
            <LocationProbe />
            <Routes>
              <Route path="/categories/:category/:kw1/:kw2" element={<CategoriesPage />} />
              <Route path="/categories/:category/:kw1" element={<CategoriesPage />} />
              <Route path="/categories/:category" element={<CategoriesPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </HelmetProvider>
    );
  }

  const currentUrl = () => {
    const url = new URL(screen.getByTestId("location").textContent ?? "", "http://x");
    const parts = ["view", "page", "keywords"]
      .filter((k) => url.searchParams.has(k))
      .map((k) => `${k}=${url.searchParams.get(k)}`);
    return `${url.pathname}?${parts.join("&")}`;
  };

  const itemWithKeywords = (keywords: string[]) =>
    ({
      ...(makeItem("1", "Q one", "Answer one") as object),
      category: "Languages",
      keywords: keywords.map((name, i) => ({ id: `k${i}`, name, isPrivate: false })),
    }) as never;

  beforeEach(() => {
    vi.clearAllMocks();
    installMemoryLocalStorage();
    vi.mocked(categoriesApi.getAll).mockResolvedValue({
      categories: [{ category: "Languages", count: 10, description: "Languages", averageRating: null }],
    } as never);
    vi.mocked(keywordsApi.getNavigationKeywords).mockResolvedValue({ keywords: [] } as never);
    vi.mocked(keywordsApi.getKeywordDescriptions).mockResolvedValue({ keywords: [] } as never);
    vi.mocked(keywordsApi.getItemTagKeywords).mockResolvedValue({ names: [] });
    vi.mocked(featuredApi.get).mockResolvedValue({ sets: [], collections: [] });
    vi.mocked(gamesApi.getRoster).mockResolvedValue({ items: [], scopes: [] } as never);
    vi.mocked(itemsApi.getAll).mockImplementation(
      async (_c, _p, _k, _col, _r, _page, pageSize) =>
        ({
          items: [itemWithKeywords(["german", "idioms", "funny"])],
          totalCount: 1,
          page: 1,
          pageSize,
          totalPages: 1,
        }) as never
    );
  });

  it("AC 3.5.13 shows a keyword that is both a topic and a tag once, as a topic chip", async () => {
    renderWithLocation("/categories/languages/german/idioms?view=items&keywords=idioms,funny");
    const group = await screen.findByRole("group", { name: "Active filters" });
    const removeIdioms = within(group).getAllByRole("button", { name: "Remove filter idioms" });
    expect(removeIdioms).toHaveLength(1);
  });

  it("AC 3.5.16 Clear all removes applied tag refinements and keeps the navigation scope", async () => {
    const user = userEvent.setup({ delay: null });
    renderWithLocation(START);
    await screen.findByText("Q one");
    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    await waitFor(() => expect(currentUrl()).toBe("/categories/languages/german/idioms?view=items&page=1"));
  });

  it("AC 3.5.17 states that keyword suggestions come only from the loaded page", async () => {
    const user = userEvent.setup({ delay: null });
    renderWithLocation(START);
    await screen.findByText("Q one");
    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    expect(
      screen.getByText("Suggestions come only from the items loaded on this page.")
    ).toBeInTheDocument();
  });
});
