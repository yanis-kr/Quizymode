import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import CategoriesPage from "./CategoriesPage";
import categoriesPageSource from "./CategoriesPage.tsx?raw";
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
vi.mock("@/api/taxonomy", () => ({
  taxonomyApi: { getAll: vi.fn().mockResolvedValue({ categories: [] }), suggest: vi.fn() },
}));
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
    expect(within(header).getByRole("link", { name: "Play 5" })).toHaveAttribute(
      "href",
      "/quiz/trivia?nav=brain-teasers%2Caha-moments&keywords=brain-teasers%2Caha-moments&size=5"
    );
    expect(within(header).getByRole("link", { name: "Play 10" })).toBeInTheDocument();
    // AC 3.5.7: Flashcards and Games are offered by the mode tabs only.
    expect(within(header).queryByRole("link", { name: "Flashcards" })).toBeNull();
    expect(within(header).queryByRole("link", { name: "Games" })).toBeNull();
    for (const name of ["Flashcards", "Quiz", "Learn", "Games"]) {
      expect(screen.getByRole("tab", { name })).toBeInTheDocument();
    }
    // The header no longer probes the games roster.
    expect(gamesApi.getRoster).not.toHaveBeenCalled();
    // AC 3.33.1: a visitor who knows nothing yet sees no progress line.
    expect(screen.queryByTestId("set-progress")).toBeNull();
    // The scope path header does not repeat the count.
    expect(screen.queryByLabelText("Question count")).not.toBeInTheDocument();
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

  it("shows the header with a real count in the Topics branch, titled with the category name", async () => {
    renderAt("/categories/trivia");

    const h1 = await screen.findByRole("heading", { level: 1, name: "Trivia" });
    const header = h1.closest("[data-testid='scope-landing-header']") as HTMLElement;
    expect(await within(header).findByText("33 questions")).toBeInTheDocument();
    expect(within(header).getByText("Fun facts and puzzles.")).toBeInTheDocument();
    expect(within(header).getByRole("link", { name: "Play 5" })).toHaveAttribute("href", "/quiz/trivia?size=5");
    await waitFor(() => expect(document.title).toBe("Trivia | Quizymode"));
  });

  it("AC 3.4.6 shows the category description once on the Topics view", async () => {
    renderAt("/categories/trivia");

    await within(await screen.findByTestId("scope-landing-header")).findByText("33 questions");
    expect(await screen.findByRole("button", { name: /brain-teasers/ })).toBeInTheDocument();
    expect(screen.getAllByText("Fun facts and puzzles.")).toHaveLength(1);
    expect(screen.getByText("Browse subtopics in this scope.")).toBeInTheDocument();
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
    expect(await screen.findByText("No questions match all filters")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear tag filters" }));
    await waitFor(() => expect(currentUrl()).toBe("/categories/languages/german/idioms?view=items&page=1"));
  });

  it("AC 3.1.4 shows 'That category does not exist.' and a link back for an unknown category slug (#787)", async () => {
    renderAt("/categories/no-such-category");
    expect(await screen.findByText("That category does not exist.")).toBeInTheDocument();
    expect(screen.queryByText("Category not found.")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to Categories/ })).toHaveAttribute("href", "/categories");
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
    // The duplicate keyword is the topic chip, not a tag chip.
    expect(removeIdioms[0]).toHaveAttribute("data-kind", "nav");
    // The duplicate keyword is not counted twice: one tag chip, so the badge reads 1.
    expect(screen.getByRole("button", { name: /^Filters/ }).textContent).toBe("Filters1");
  });

  it("AC 3.5.16 Clear all removes applied tag refinements and keeps the navigation scope", async () => {
    const user = userEvent.setup({ delay: null });
    renderWithLocation(START);
    await screen.findByText("Q one");
    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    await waitFor(() => expect(currentUrl()).toBe("/categories/languages/german/idioms?view=items&page=1"));
    // A later Apply keeps the navigation scope instead of turning the path into tag topics.
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(currentUrl()).toBe("/categories/languages/german/idioms?view=items&page=1"));
  });

  it("AC 3.5.16 Clear all also removes search, type and rating refinements from the URL", async () => {
    const user = userEvent.setup({ delay: null });
    renderWithLocation(`${START}&search=cats&filterType=question&ratingMin=3`);
    // The search and rating refinements may hide the mocked item, so wait for the toolbar instead.
    await user.click(await screen.findByRole("button", { name: /^Filters/ }));
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    await waitFor(() => {
      const search = new URL(screen.getByTestId("location").textContent ?? "", "http://x").search;
      expect(search).not.toMatch(/search=|filterType=|ratingMin=|keywords=/);
      expect(search).toMatch(/view=items/);
    });
  });

  it("AC 3.5.17 states that keyword suggestions come only from the loaded page", async () => {
    const user = userEvent.setup({ delay: null });
    renderWithLocation(START);
    await screen.findByText("Q one");
    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    expect(
      screen.getByText("Suggestions come only from the questions loaded on this page.")
    ).toBeInTheDocument();
  });
});

describe("Empty topics (#900)", () => {
  const bucket = (name: string, itemCount: number) => ({
    name,
    itemCount,
    averageRating: null,
    navigationRank: 1,
    description: null,
  });

  /** Rows by "category/selected,keywords"; a missing entry is an empty response. */
  let rows: Record<string, ReturnType<typeof bucket>[]> = {};
  let scopeTotal = 12;

  beforeEach(() => {
    vi.clearAllMocks();
    installMemoryLocalStorage();
    rows = {};
    scopeTotal = 12;
    vi.mocked(categoriesApi.getAll).mockResolvedValue({
      categories: [
        { category: "Geography", count: 12, description: "Places.", averageRating: null },
        { category: "History", count: 3, description: "Past.", averageRating: null },
      ],
    } as never);
    vi.mocked(keywordsApi.getNavigationKeywords).mockImplementation(async (category, selected) => ({
      keywords: rows[[category, ...(selected ?? [])].join("/")] ?? [],
    }));
    vi.mocked(keywordsApi.getKeywordDescriptions).mockResolvedValue({ keywords: [] });
    vi.mocked(keywordsApi.getItemTagKeywords).mockResolvedValue({ names: [] });
    vi.mocked(featuredApi.get).mockResolvedValue({ sets: [], collections: [] });
    vi.mocked(itemsApi.getAll).mockImplementation(async (_c, _p, _k, _col, _r, _page, pageSize) => {
      const items = scopeTotal > 0 ? [makeItem("1", "Q one", "Answer one")] : [];
      return { items, totalCount: scopeTotal, page: 1, pageSize, totalPages: 1 } as never;
    });
  });

  /** Names on the bucket tiles, in page order. */
  const tiles = () =>
    screen
      .queryAllByRole("button")
      .filter((el) => el.tagName === "DIV")
      .map((el) => el.querySelector("h3")?.textContent);

  const expectNoTopicsTab = async () => {
    expect(await screen.findByRole("tab", { name: "List" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Topics" })).not.toBeInTheDocument();
  };

  it.each([
    ["category", "/categories/geography", "Geography"],
    ["topic", "/categories/geography/capitals", "Geography/capitals"],
  ])("AC 3.4.2 hides empty buckets on a %s Topics view and sorts the shown ones", async (_name, url, key) => {
    const user = userEvent.setup({ delay: null });
    rows[key] = [bucket("apple", 5), bucket("general", 0), bucket("zebra", 9)];
    renderAt(url);

    await screen.findByRole("button", { name: /apple/ });
    expect(tiles()).toEqual(["apple", "zebra"]);
    expect(screen.queryByText("0 questions")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Topics" })).toBeInTheDocument();

    await user.selectOptions(screen.getByDisplayValue("Name"), "count");
    await waitFor(() => expect(tiles()).toEqual(["zebra", "apple"]));
  });

  it.each([
    ["category", "/categories/geography", "Geography"],
    ["topic", "/categories/geography/capitals", "Geography/capitals"],
  ])("AC 3.4.4a treats a %s with questions and only empty subtopics as having no child buckets", async (_name, url, key) => {
    rows[key] = [bucket("general", 0), bucket("misc", 0)];
    renderAt(url);

    expect(await screen.findByText("Q one")).toBeInTheDocument();
    await expectNoTopicsTab();
    expect(tiles()).toEqual([]);
    expect(screen.queryByText("No topics in this level.")).not.toBeInTheDocument();
  });

  it("AC 3.4.8 shows the empty state and no study buttons for a direct link to an empty topic", async () => {
    scopeTotal = 0;
    rows["Geography/general"] = [bucket("misc", 0), bucket("oddities", 0)];
    renderAt("/categories/geography/general");

    expect(await screen.findByText("No questions here yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse categories" })).toHaveAttribute("href", "/categories");
    await expectNoTopicsTab();
    expect(tiles()).toEqual([]);
    expect(screen.queryByText(/misc|oddities/)).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Play these questions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /list questions|flashcards mode|quiz mode/i })).not.toBeInTheDocument();
  });

  const openFilters = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole("button", { name: /^filters/i }));
  };
  const optionNames = () =>
    within(screen.getByRole("listbox"))
      .getAllByRole("option")
      .map((option) => option.textContent);

  it("AC 3.9.3 offers only topics with questions in the filter dialog of a category", async () => {
    const user = userEvent.setup({ delay: null });
    rows["Geography"] = [bucket("capitals", 12), bucket("general", 0)];
    rows["Geography/capitals"] = [bucket("europe", 4), bucket("misc", 0)];
    renderAt("/categories/geography");
    await openFilters(user);

    await user.click(screen.getByPlaceholderText("All topics"));
    await waitFor(() => expect(optionNames()).toEqual(["All topics", "capitals"]));
    await user.click(screen.getByRole("option", { name: "capitals" }));

    await user.click(screen.getByPlaceholderText("All subtopics"));
    await waitFor(() => expect(optionNames()).toEqual(["All subtopics", "europe"]));
  });

  it("AC 3.9.3 under All categories offers a topic name when any category has questions under it", async () => {
    const user = userEvent.setup({ delay: null });
    rows["Geography"] = [bucket("general", 0), bucket("shared", 0), bucket("local", 12)];
    rows["History"] = [bucket("general", 0), bucket("shared", 3)];
    rows["Geography/shared"] = [bucket("maps", 0), bucket("rivers", 0)];
    rows["History/shared"] = [bucket("maps", 2), bucket("rivers", 0)];
    renderAt("/categories/geography");
    await openFilters(user);
    await user.selectOptions(screen.getByDisplayValue("Geography"), "all");

    await user.click(screen.getByPlaceholderText("All topics"));
    await waitFor(() => expect(optionNames()).toEqual(["All topics", "local", "shared"]));
    await user.click(screen.getByRole("option", { name: "shared" }));

    await user.click(screen.getByPlaceholderText("All subtopics"));
    await waitFor(() => expect(optionNames()).toEqual(["All subtopics", "maps"]));
  });

  it("AC 3.9.3 keeps an empty topic taken from the URL selected", async () => {
    const user = userEvent.setup({ delay: null });
    scopeTotal = 0;
    rows["Geography"] = [bucket("capitals", 12), bucket("general", 0)];
    renderAt("/categories/geography/general");
    await screen.findByText("No questions here yet.");
    await openFilters(user);

    expect(screen.getByPlaceholderText("All topics")).toHaveValue("general");
    await user.click(screen.getByPlaceholderText("All topics"));
    expect(screen.queryByRole("option", { name: "general" })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("All topics")).toHaveValue("general");
  });
});

describe("CategoriesPage category display names (#902)", () => {
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
              <Route path="/categories/:category" element={<CategoriesPage />} />
              <Route path="/categories" element={<CategoriesPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </HelmetProvider>
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    installMemoryLocalStorage();
    vi.mocked(categoriesApi.getAll).mockResolvedValue({
      categories: [
        { category: "geography", count: 12, description: "Maps.", averageRating: null },
        { category: "act-math", count: 3, description: null, averageRating: null },
      ],
    } as never);
    vi.mocked(keywordsApi.getNavigationKeywords).mockResolvedValue({
      keywords: [{ name: "capitals", itemCount: 12, averageRating: null, navigationRank: 1, description: null }],
    } as never);
    vi.mocked(keywordsApi.getKeywordDescriptions).mockResolvedValue({ keywords: [] } as never);
    vi.mocked(keywordsApi.getItemTagKeywords).mockResolvedValue({ names: [] });
    vi.mocked(featuredApi.get).mockResolvedValue({ sets: [], collections: [] });
    vi.mocked(gamesApi.getRoster).mockResolvedValue({ items: [], scopes: [] } as never);
    vi.mocked(itemsApi.getAll).mockResolvedValue({
      items: [], totalCount: 0, page: 1, pageSize: 10, totalPages: 1,
    } as never);
  });

  it.each([
    ["Geography", "/categories/geography?view=sets"],
    ["Act Math", "/categories/act-math?view=sets"],
  ])("shows the %s tile capitalised and opens the same address", async (name, address) => {
    const user = userEvent.setup({ delay: null });
    renderWithLocation("/categories");

    await user.click(await screen.findByRole("button", { name: new RegExp(name) }));

    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe(address));
  });

  it("capitalises the category eyebrow on topic tiles and keeps the topic name as stored", async () => {
    renderWithLocation("/categories/geography");

    const tile = await screen.findByRole("button", { name: /capitals/ });
    expect(within(tile).getByText("Geography")).toBeInTheDocument();
    expect(within(tile).getByRole("heading", { name: "capitals" })).toBeInTheDocument();
  });

  it.each(["/categories/geography?view=sets", "/categories/geography?view=items"])(
    "shows the category display name in the breadcrumb of %s and keeps the slug in its address (#929)",
    async (url) => {
      const user = userEvent.setup({ delay: null });
      renderWithLocation(url);

      await user.click(await screen.findByRole("button", { name: "Geography" }));

      await waitFor(() => expect(screen.getByTestId("location").textContent).toMatch(/^\/categories\/geography\?/));
    }
  );

  it.each(["/categories/geography", "/categories/geography?view=items"])(
    "capitalises the category filter options at %s and keeps their values",
    async (url) => {
      const user = userEvent.setup({ delay: null });
      renderWithLocation(url);

      await user.click(await screen.findByRole("button", { name: /^filters/i }));

      expect(screen.getByRole("option", { name: "Geography" })).toHaveValue("geography");
      expect(screen.getByRole("option", { name: "Act Math" })).toHaveValue("act-math");
    }
  );
});

describe("Questions and topics wording (#922)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMemoryLocalStorage();
    vi.mocked(categoriesApi.getAll).mockResolvedValue({
      categories: [{ category: "Geography", count: 12, description: "Places.", averageRating: null }],
    } as never);
    vi.mocked(keywordsApi.getNavigationKeywords).mockResolvedValue({
      keywords: [{ name: "capitals", itemCount: 12, averageRating: null, navigationRank: 1, description: null }],
    } as never);
    vi.mocked(keywordsApi.getKeywordDescriptions).mockResolvedValue({ keywords: [] });
    vi.mocked(keywordsApi.getItemTagKeywords).mockResolvedValue({ names: [] });
    vi.mocked(featuredApi.get).mockResolvedValue({ sets: [], collections: [] });
    vi.mocked(itemsApi.getAll).mockImplementation(async (_c, _p, _k, _col, _r, _page, pageSize) => {
      const items = [makeItem("1", "Q one", "Answer one")];
      return { items, totalCount: 12, page: 1, pageSize, totalPages: 1 } as never;
    });
  });

  it.each([
    ["/categories/geography"],
    ["/categories/geography?view=sets"],
  ])("AC 3.4.14 %s opens the Topics view with the Topics tab and the Question count sort (#922)", async (url) => {
    renderAt(url);

    expect(await screen.findByRole("button", { name: /capitals/ })).toHaveTextContent("12 questions");
    expect(screen.getByRole("tab", { name: "Topics" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "Question count" })).toHaveValue("count");
    expect(screen.queryByText("Q one")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\b(item|items|sets)\b/i);
    await waitFor(() => expect(document.title).toBe("Geography | Quizymode"));
  });

  it("AC 3.4.14 ?view=items opens the List view with question wording (#922)", async () => {
    renderAt("/categories/geography?view=items");

    expect(await screen.findByText("Q one")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "List" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Topics" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByText("Browse questions in this scope.")).toBeInTheDocument();
    expect(screen.getByTitle("View question details")).toHaveAttribute("href", expect.stringMatching(/^\/items\/1/));
    expect(screen.queryByRole("button", { name: /capitals/ })).not.toBeInTheDocument();
  });

  it("AC 3.4.12 says No questions found. for an empty list (#922)", async () => {
    vi.mocked(itemsApi.getAll).mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 } as never);
    renderAt("/categories/geography?view=items");

    expect(await screen.findByText("No questions found.")).toBeInTheDocument();
  });

  it("AC 3.4.12 says No topics in this level. and List questions when no topics can be listed (#922)", async () => {
    vi.mocked(keywordsApi.getNavigationKeywords).mockRejectedValue(new Error("down"));
    renderAt("/categories/geography");

    expect(await screen.findByText("No topics in this level.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "List questions" })).toBeInTheDocument();
  });

  it("AC 3.4.12 names the filters Visibility and speaks of questions (#922)", async () => {
    const user = userEvent.setup({ delay: null });
    renderAt("/categories/geography?view=items");

    await user.click(await screen.findByRole("button", { name: /^Filters/ }));
    await user.click(screen.getByRole("button", { name: /Visibility/ }));
    await user.click(screen.getByRole("button", { name: /Rating/ }));
    await user.click(screen.getByRole("button", { name: /Text Search/ }));

    expect(screen.getByText("Visibility")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Public" })).toBeInTheDocument();
    expect(screen.getByText("Only questions with no rating")).toBeInTheDocument();
    expect(screen.getByText("Include questions with no rating")).toBeInTheDocument();
    expect(screen.getByText("Searches across question content, category, and keywords")).toBeInTheDocument();
    expect(screen.queryByText("Item Type")).not.toBeInTheDocument();
  });

  it.each([
    ["the topic tiles", "/categories/geography"],
    ["an empty topic level", "/categories/geography/empty-topic"],
    ["the List view", "/categories/geography?view=items"],
    ["a childless scope", "/categories/geography/capitals/europe?view=sets"],
  ])("renders no List topics button on %s (#929)", async (_state, url) => {
    renderAt(url);

    await screen.findAllByRole("tab", { name: "List" });
    expect(screen.queryByRole("button", { name: "List topics" })).not.toBeInTheDocument();
  });

  it("renders no List topics button when the topics cannot be loaded (#929)", async () => {
    vi.mocked(keywordsApi.getNavigationKeywords).mockRejectedValue(new Error("down"));
    renderAt("/categories/geography");

    expect(await screen.findByRole("button", { name: "List questions" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "List topics" })).not.toBeInTheDocument();
  });

  // The Topics branch never renders for a childless scope, so this message cannot be reached through the page; it was
  // not proved removable for every state, so it stays (#929).
  it("AC 3.4.12 keeps the end-of-subtopics message and has no List topics handler left (#922, #929)", () => {
    expect(categoriesPageSource).toContain(
      "There are no more subtopics here. Browse questions, use flashcards, or take a quiz."
    );
    expect(categoriesPageSource).not.toMatch(/List topics|onListSets|List sets|List items|sets hierarchy/);
  });
});

describe("Categories map button (#926)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMemoryLocalStorage();
    vi.mocked(categoriesApi.getAll).mockResolvedValue({
      categories: [{ category: "Geography", count: 12, description: "Places.", averageRating: null }],
    } as never);
    vi.mocked(keywordsApi.getNavigationKeywords).mockResolvedValue({
      keywords: [{ name: "capitals", itemCount: 12, averageRating: null, navigationRank: 1, description: null }],
    } as never);
    vi.mocked(keywordsApi.getKeywordDescriptions).mockResolvedValue({ keywords: [] });
    vi.mocked(keywordsApi.getItemTagKeywords).mockResolvedValue({ names: [] });
    vi.mocked(featuredApi.get).mockResolvedValue({ sets: [], collections: [] });
    vi.mocked(itemsApi.getAll).mockResolvedValue({
      items: [makeItem("1", "Q one", "Answer one")], totalCount: 1, page: 1, pageSize: 10, totalPages: 1,
    } as never);
  });

  it.each([
    ["the category List view", "/categories/geography?view=items"],
    ["the All categories List view", "/categories/all?view=items"],
  ])("opens the map from %s and closing it returns to the same list (#926)", async (_name, url) => {
    const user = userEvent.setup({ delay: null });
    renderAt(url);
    await screen.findByText("Q one");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Map" }));
    const dialog = screen.getByRole("dialog", { name: /map/i });
    await user.click(within(dialog).getByRole("button", { name: /close/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Q one")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "List" })).toHaveAttribute("aria-selected", "true");
  });

  it.each([
    ["the category index", "/categories"],
    ["a category topic view", "/categories/geography"],
  ])("still opens the map from %s (#926)", async (_name, url) => {
    const user = userEvent.setup({ delay: null });
    renderAt(url);

    await user.click(await screen.findByRole("button", { name: "Map" }));

    expect(screen.getByRole("dialog", { name: /map/i })).toBeInTheDocument();
  });
});
