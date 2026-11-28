import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CategoriesMapModal from "./CategoriesMapModal";
import { categoriesApi } from "@/api/categories";
import { keywordsApi } from "@/api/keywords";
import { taxonomyApi } from "@/api/taxonomy";

vi.mock("@/api/categories", () => ({
  categoriesApi: {
    getAll: vi.fn(),
  },
}));

vi.mock("@/api/keywords", () => ({
  keywordsApi: {
    getNavigationKeywords: vi.fn(),
  },
}));

vi.mock("@/api/taxonomy", () => ({
  taxonomyApi: {
    getAll: vi.fn(),
    suggest: vi.fn(),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: true, userId: "user-1" }),
}));

function renderModal() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CategoriesMapModal isOpen onClose={() => undefined} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("CategoriesMapModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(categoriesApi.getAll).mockResolvedValue({
      categories: [
        {
          id: "cat-1",
          category: "Exams",
          description: "Exam preparation",
          shortDescription: "Exam prep",
          count: 10,
          isPrivate: false,
          averageStars: null,
        },
      ],
    });

    vi.mocked(taxonomyApi.getAll).mockResolvedValue({
      categories: [
        {
          slug: "exams",
          name: "Exams",
          description: "Exam preparation",
          itemCount: 0,
          allKeywordSlugs: ["aws", "saa-c03"],
          groups: [
            {
              slug: "aws",
              description: "AWS certs",
              itemCount: 0,
              keywords: [
                {
                  slug: "saa-c03",
                  description: "Solutions Architect Associate",
                  itemCount: 0,
                },
              ],
            },
          ],
        },
      ],
    });

    vi.mocked(keywordsApi.getNavigationKeywords).mockImplementation(
      async (_category, selectedKeywords) => {
        if (!selectedKeywords || selectedKeywords.length === 0) {
          return {
            keywords: [
              {
                name: "aws",
                itemCount: 7,
                averageRating: null,
                navigationRank: 1,
                description: "AWS certs",
                privateItemCount: 0,
              },
            ],
          };
        }

        return {
          keywords: [
            {
              name: "saa-c03",
              itemCount: 4,
              averageRating: null,
              navigationRank: 2,
              description: "Solutions Architect Associate",
              privateItemCount: 0,
            },
          ],
        };
      }
    );
  });

  it("renders the taxonomy tree and supports expand and collapse controls", async () => {
    const user = userEvent.setup();

    renderModal();

    expect(
      screen.getByRole("heading", { name: /categories map/i })
    ).toBeInTheDocument();

    await waitFor(() => expect(taxonomyApi.getAll).toHaveBeenCalledTimes(1));

    expect(await screen.findByRole("link", { name: "Exams" })).toHaveAttribute(
      "href",
      "/categories/exams"
    );
    expect(screen.getByLabelText("10 questions")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "aws" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "saa-c03" })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /expand exams/i }));

    expect(screen.getByRole("link", { name: "aws" })).toHaveAttribute(
      "href",
      "/categories/exams/aws"
    );
    expect(screen.getByLabelText("7 questions")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /expand aws/i }));

    expect(screen.getByRole("link", { name: "saa-c03" })).toHaveAttribute(
      "href",
      "/categories/exams/aws/saa-c03"
    );
    expect(screen.getByLabelText("4 questions")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /collapse all/i }));

    expect(screen.queryByRole("link", { name: "aws" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /expand all/i }));

    expect(screen.getByRole("link", { name: "aws" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "saa-c03" })).toBeInTheDocument();
  });

  it("shows the display name of a lowercase category and links to its slug (#929)", async () => {
    vi.mocked(categoriesApi.getAll).mockResolvedValue({
      categories: [{ id: "cat-g", category: "geography", description: null, count: 3, isPrivate: false, averageStars: null }],
    } as never);
    vi.mocked(taxonomyApi.getAll).mockResolvedValue({
      categories: [{ slug: "geography", name: "geography", description: null, itemCount: 3, allKeywordSlugs: [], groups: [] }],
    });
    renderModal();

    expect(await screen.findByRole("link", { name: "Geography" })).toHaveAttribute("href", "/categories/geography");
  });

  const leaf = (slug: string) => ({ slug, description: null, itemCount: 0 });
  const group = (slug: string, keywords: string[]) => ({ ...leaf(slug), keywords: keywords.map(leaf) });
  const category = (slug: string, name: string, groups: ReturnType<typeof group>[]) => ({
    ...leaf(slug),
    name,
    allKeywordSlugs: [],
    groups,
  });
  const row = (name: string, itemCount: number) => ({
    name,
    itemCount,
    averageRating: null,
    navigationRank: 1,
    description: null,
    privateItemCount: 0,
  });

  const mockTree = () =>
    vi.mocked(taxonomyApi.getAll).mockResolvedValue({
      categories: [
        category("exams", "Exams", [
          group("aws", ["saa-c03", "zero-sub", "no-row-sub"]),
          group("zero-topic", ["under-zero"]),
          group("no-row-topic", []),
        ]),
        category("empty-cat", "Empty Cat", []),
        category("no-row-cat", "No Row Cat", []),
      ],
    });
  const link = (name: string) => screen.queryByRole("link", { name });
  const expandAll = () => userEvent.setup().click(screen.getByRole("button", { name: /expand all/i }));

  it("AC 3.4.9 lists no topic or category with 0 questions or no row once counts have loaded", async () => {
    mockTree();
    vi.mocked(categoriesApi.getAll).mockResolvedValue({
      categories: [
        { category: "Exams", count: 10 },
        { category: "Empty Cat", count: 0 },
      ],
    } as never);
    vi.mocked(keywordsApi.getNavigationKeywords).mockImplementation(async (_category, selected) => ({
      keywords: selected?.length
        ? [row("saa-c03", 4), row("zero-sub", 0)]
        : [row("aws", 7), row("zero-topic", 0)],
    }));

    renderModal();
    await screen.findByRole("link", { name: "Exams" });
    await expandAll();

    await waitFor(() => {
      for (const name of ["Empty Cat", "No Row Cat", "zero-topic", "no-row-topic", "under-zero", "zero-sub", "no-row-sub"]) {
        expect(link(name)).not.toBeInTheDocument();
      }
    });
    expect(link("aws")).toBeInTheDocument();
    expect(link("saa-c03")).toBeInTheDocument();
  });

  it("AC 3.4.9 keeps the nodes listed when their count requests fail", async () => {
    mockTree();
    vi.mocked(categoriesApi.getAll).mockRejectedValue(new Error("down"));
    vi.mocked(keywordsApi.getNavigationKeywords).mockRejectedValue(new Error("down"));

    renderModal();
    await screen.findByRole("link", { name: "Exams" });
    await waitFor(() => expect(keywordsApi.getNavigationKeywords).toHaveBeenCalled());
    await act(async () => {});
    await expandAll();

    for (const name of ["Empty Cat", "No Row Cat", "aws", "saa-c03", "zero-sub", "zero-topic", "under-zero", "no-row-topic"]) {
      expect(link(name)).toBeInTheDocument();
    }
  });

  it("AC 3.4.9 keeps the subtopics listed when only their count requests fail", async () => {
    mockTree();
    vi.mocked(categoriesApi.getAll).mockResolvedValue({ categories: [{ category: "Exams", count: 10 }] } as never);
    vi.mocked(keywordsApi.getNavigationKeywords).mockImplementation(async (_category, selected) => {
      if (selected?.length) throw new Error("down");
      return { keywords: [row("aws", 7)] };
    });

    renderModal();
    await screen.findByRole("link", { name: "Exams" });
    await waitFor(() => expect(link("No Row Cat")).not.toBeInTheDocument());
    await expandAll();

    await waitFor(() => expect(link("zero-topic")).not.toBeInTheDocument());
    for (const name of ["aws", "saa-c03", "zero-sub", "no-row-sub"]) {
      expect(link(name)).toBeInTheDocument();
    }
  });
});
