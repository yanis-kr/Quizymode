import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CategoriesMapModal from "./CategoriesMapModal";
import { taxonomyApi } from "@/api/taxonomy";
import { categoriesApi } from "@/api/categories";

vi.mock("@/api/taxonomy", () => ({
  taxonomyApi: {
    getAll: vi.fn(),
  },
}));

vi.mock("@/api/categories", () => ({
  categoriesApi: {
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

    vi.mocked(taxonomyApi.getAll).mockResolvedValue({
      categories: [
        {
          slug: "exams",
          description: "Exam preparation",
          allKeywordSlugs: ["aws", "saa-c03"],
          groups: [
            {
              slug: "aws",
              description: "AWS certs",
              keywords: [
                {
                  slug: "saa-c03",
                  description: "Solutions Architect Associate",
                },
              ],
            },
          ],
        },
      ],
    });

    vi.mocked(categoriesApi.getAll).mockResolvedValue({
      categories: [
        {
          id: "cat-1",
          category: "Exams",
          description: "Exam preparation",
          shortDescription: "Exam preparation",
          count: 10,
          isPrivate: false,
          averageStars: null,
        },
      ],
    });
  });

  it("renders the taxonomy tree and supports expand and collapse controls", async () => {
    const user = userEvent.setup();

    renderModal();

    expect(
      screen.getByRole("heading", { name: /categories map/i })
    ).toBeInTheDocument();

    await waitFor(() => expect(taxonomyApi.getAll).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(categoriesApi.getAll).toHaveBeenCalledTimes(1));

    expect(screen.getByRole("link", { name: "Exams" })).toHaveAttribute(
      "href",
      "/categories/exams"
    );
    expect(screen.getByRole("link", { name: "aws" })).toHaveAttribute(
      "href",
      "/categories/exams/aws"
    );
    expect(
      screen.queryByRole("link", { name: "saa-c03" })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /expand aws/i }));

    expect(screen.getByRole("link", { name: "saa-c03" })).toHaveAttribute(
      "href",
      "/categories/exams/aws/saa-c03"
    );

    await user.click(screen.getByRole("button", { name: /collapse all/i }));

    expect(screen.queryByRole("link", { name: "aws" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /expand all/i }));

    expect(screen.getByRole("link", { name: "saa-c03" })).toBeInTheDocument();
  });
});
