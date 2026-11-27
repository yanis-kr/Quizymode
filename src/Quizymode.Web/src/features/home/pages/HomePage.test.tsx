import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import HomePage from "./HomePage";
import { categoriesApi } from "@/api/categories";
import { collectionsApi } from "@/api/collections";
import { featuredApi } from "@/api/featured";

vi.mock("@/api/categories", () => ({
  categoriesApi: {
    getAll: vi.fn(),
  },
}));

vi.mock("@/api/collections", () => ({
  collectionsApi: {
    discover: vi.fn(),
  },
}));

vi.mock("@/api/featured", () => ({
  featuredApi: {
    get: vi.fn(),
  },
}));

vi.mock("@/api/learningLoop", () => ({
  interestsApi: { popularCategories: vi.fn().mockResolvedValue([]), get: vi.fn(), replace: vi.fn() },
  dailyQuizApi: { get: vi.fn() },
  reviewQueueApi: { getSummary: vi.fn() },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: false,
  }),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

describe("HomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(categoriesApi.getAll).mockResolvedValue({ categories: [] });
    vi.mocked(collectionsApi.discover).mockResolvedValue({ items: [], totalCount: 0 });
    vi.mocked(featuredApi.get).mockResolvedValue({ sets: [], collections: [] });
  });

  it("offers the existing five-question public quiz without requiring an account", async () => {
    renderPage();

    expect(
      screen.getByRole("heading", {
        name: /learn something new in five questions/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByText(/no account needed/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /play a 5-question quiz/i })).toHaveAttribute(
      "href",
      "/start"
    );

    await waitFor(() => {
      expect(document.title).toBe("Quizymode – Smart Flashcards & Learning Quizzes");
      expect(document.querySelector('meta[name="description"]')).toHaveAttribute(
        "content",
        expect.stringMatching(/five-question quiz with no account needed/i)
      );
    });
  });

  it("shows a Play a game tile linking to /games (AC 3.35.2)", () => {
    renderPage();
    expect(screen.getByRole("link", { name: "Play a game" })).toHaveAttribute("href", "/games");
  });
  it("clips the decorative hero shapes so they cannot cause horizontal page scroll", () => {
    renderPage();

    // jsdom has no layout; the real-browser width check lives in playwright/e2e/home.spec.ts (#151).
    const decor = screen.getByTestId("home-hero-decor");
    expect(decor).toHaveClass("absolute", "inset-0", "overflow-hidden", "pointer-events-none");
    expect(decor).toHaveAttribute("aria-hidden", "true");
    expect(decor.parentElement).toHaveClass("relative");
  });

  it("keeps the hero and category browsing usable when categories fail", async () => {
    vi.mocked(categoriesApi.getAll).mockRejectedValueOnce(new Error("db down"));

    renderPage();

    expect(
      screen.getByRole("heading", {
        name: /learn something new in five questions/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByText(/categories/i, { selector: "div" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /exams/i })).toHaveAttribute("href", "/categories/exams");
    expect(screen.getByRole("link", { name: /play a 5-question quiz/i })).toBeInTheDocument();

    await waitFor(() => expect(categoriesApi.getAll).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("42 questions")).not.toBeInTheDocument();
  });

  it.each([
    ["featured sets", () => vi.mocked(featuredApi.get).mockRejectedValueOnce(new Error("featured down"))],
    ["public collections", () => vi.mocked(collectionsApi.discover).mockRejectedValueOnce(new Error("collections down"))],
    [
      "all home queries",
      () => {
        vi.mocked(categoriesApi.getAll).mockRejectedValueOnce(new Error("categories down"));
        vi.mocked(featuredApi.get).mockRejectedValueOnce(new Error("featured down"));
        vi.mocked(collectionsApi.discover).mockRejectedValueOnce(new Error("collections down"));
      },
    ],
  ])("keeps the quick quiz and categories usable when %s fail", async (_name, arrangeFailure) => {
    arrangeFailure();

    renderPage();

    expect(screen.getByRole("link", { name: /play a 5-question quiz/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /show all/i })).toHaveAttribute(
      "href",
      "/categories"
    );
    expect(screen.getByRole("link", { name: /exams/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(categoriesApi.getAll).toHaveBeenCalledTimes(1);
      expect(featuredApi.get).toHaveBeenCalledTimes(1);
      expect(collectionsApi.discover).toHaveBeenCalledTimes(1);
    });
  });

  it("adds live category counters when the API responds", async () => {
    vi.mocked(categoriesApi.getAll).mockResolvedValueOnce({
      categories: [
        {
          id: "cat-1",
          category: "exams",
          description: "Exams",
          shortDescription: "Exams",
          count: 42,
          isPrivate: false,
          averageStars: null,
        },
        {
          id: "cat-2",
          category: "science",
          description: "Science",
          shortDescription: "Science",
          count: 7,
          isPrivate: false,
          averageStars: null,
        },
      ],
    });

    renderPage();

    expect(await screen.findByText("42 questions")).toBeInTheDocument();
    expect(screen.getByText("7 questions")).toBeInTheDocument();
  });
});

describe("HomePage Fun expressions card (#664)", () => {
  it("AC 3.0.36 shows the Fun expressions card for a guest even when there are no featured sets", async () => {
    vi.mocked(categoriesApi.getAll).mockResolvedValue({ categories: [] });
    vi.mocked(collectionsApi.discover).mockResolvedValue({ items: [] } as never);
    vi.mocked(featuredApi.get).mockResolvedValue({ sets: [], collections: [] });

    renderPage();

    const links = await screen.findAllByRole("link", { name: /Fun expressions/ });
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/categories/languages?keywords=idioms,funny&view=items");
    }
  });

  it("AC 3.0.36 shows the Fun expressions entry in the first-visit hero", () => {
    vi.mocked(categoriesApi.getAll).mockResolvedValue({ categories: [] });
    vi.mocked(collectionsApi.discover).mockResolvedValue({ items: [] } as never);
    vi.mocked(featuredApi.get).mockResolvedValue({ sets: [], collections: [] });

    renderPage();

    const hero = screen.getByRole("heading", { level: 1 }).closest("section")!;
    const link = within(hero).getByRole("link", { name: "Fun expressions" });
    expect(link).toHaveAttribute("href", "/categories/languages?keywords=idioms,funny&view=items");
    expect(link.className).toContain("min-h-[44px]");
  });
});

describe("HomePage plain wording (#902)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(categoriesApi.getAll).mockResolvedValue({ categories: [] });
    vi.mocked(collectionsApi.discover).mockResolvedValue({ items: [], totalCount: 0 });
    vi.mocked(featuredApi.get).mockResolvedValue({
      sets: [
        {
          id: "f1",
          displayName: "World Capitals",
          categorySlug: "geography",
          navKeyword1: "capitals",
          navKeyword2: null,
          itemCount: 12,
          lastModifiedAt: null,
          sortOrder: 1,
        },
      ],
      collections: [],
    } as never);
  });

  // The set also appears in the Recommended lane, so look inside Featured topics only.
  async function featuredSetLink() {
    const lane = screen.getByText("Featured topics").closest("section")!;
    return { lane, featured: await within(lane).findByRole("link", { name: /World Capitals/ }) };
  }

  it("AC 3.0.3 does not show the free line", async () => {
    renderPage();

    await featuredSetLink();
    expect(screen.queryByText(/Learn, Test and Review are free/)).not.toBeInTheDocument();
  });

  it("shows capitalised category chips on Featured topics and Fun expressions and keeps the links (#902)", async () => {
    renderPage();

    const { lane, featured } = await featuredSetLink();
    expect(within(featured).getByText("Geography")).toBeInTheDocument();
    expect(within(featured).queryByText("geography")).not.toBeInTheDocument();
    expect(featured).toHaveAttribute("href", "/categories/geography/capitals");

    const fun = within(lane).getByRole("link", { name: /Fun expressions/ });
    expect(within(fun).getByText("Languages")).toBeInTheDocument();
    expect(within(fun).queryByText("languages")).not.toBeInTheDocument();
    expect(fun).toHaveAttribute("href", "/categories/languages?keywords=idioms,funny&view=items");
  });
});

describe("HomePage questions and topics wording (#922)", () => {
  it("AC 3.4.12 names the lane Featured topics and counts questions in the singular and plural (#922)", async () => {
    vi.clearAllMocks();
    const category = (slug: string, count: number) => ({
      id: slug,
      category: slug,
      description: slug,
      shortDescription: slug,
      count,
      isPrivate: false,
      averageStars: null,
    });
    const collection = (id: string, name: string, itemCount: number) => ({
      id,
      name,
      description: null,
      itemCount,
      createdBy: "someone",
      createdAt: "2026-01-01T00:00:00Z",
    });
    vi.mocked(categoriesApi.getAll).mockResolvedValue({ categories: [category("exams", 1), category("science", 1200)] });
    vi.mocked(collectionsApi.discover).mockResolvedValue({
      items: [collection("c1", "Alpha", 1), collection("c2", "Beta", 3)],
      totalCount: 2,
    } as never);
    vi.mocked(featuredApi.get).mockResolvedValue({ sets: [], collections: [] });

    renderPage();

    expect(await screen.findByText("1,200 questions")).toBeInTheDocument();
    expect(await screen.findByText("3 questions")).toBeInTheDocument();
    expect(screen.getAllByText("1 question")).toHaveLength(2);
    expect(screen.getByText("Featured topics")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\b(item|items|sets)\b/i);
    await waitFor(() =>
      expect(document.querySelector('meta[name="description"]')).toHaveAttribute(
        "content",
        expect.stringContaining("featured topics, and public collections")
      )
    );
  });
});
