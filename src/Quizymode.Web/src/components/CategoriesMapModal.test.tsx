import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
  },
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
    expect(screen.getByLabelText("10 items")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "aws" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "saa-c03" })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /expand exams/i }));

    expect(screen.getByRole("link", { name: "aws" })).toHaveAttribute(
      "href",
      "/categories/exams/aws"
    );
    expect(screen.getByLabelText("7 items")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /expand aws/i }));

    expect(screen.getByRole("link", { name: "saa-c03" })).toHaveAttribute(
      "href",
      "/categories/exams/aws/saa-c03"
    );
    expect(screen.getByLabelText("4 items")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /collapse all/i }));

    expect(screen.queryByRole("link", { name: "aws" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /expand all/i }));

    expect(screen.getByRole("link", { name: "aws" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "saa-c03" })).toBeInTheDocument();
  });
});
