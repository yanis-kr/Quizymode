import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import HomePage from "./HomePage";
import { categoriesApi } from "@/api/categories";

vi.mock("@/api/categories", () => ({
  categoriesApi: {
    getAll: vi.fn(),
  },
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
  });

  it("renders the static homepage catalog even when categories API fails", async () => {
    vi.mocked(categoriesApi.getAll).mockRejectedValueOnce(new Error("db down"));

    renderPage();

    expect(
      screen.getByRole("heading", {
        name: /browse categories, open a set, and start learning immediately/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /explore all quizymode categories/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /exams/i })).toHaveAttribute("href", "/categories/exams");
    expect(screen.getByRole("link", { name: /aws saa-c03/i })).toHaveAttribute(
      "href",
      "/categories/exams/aws/saa-c03"
    );
    expect(screen.getByRole("link", { name: /open sample collection/i })).toHaveAttribute(
      "href",
      "/collections/8f9b8c14-8d30-4d94-9b20-4c7bb7f7f511"
    );

    await waitFor(() => expect(categoriesApi.getAll).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("42 items")).not.toBeInTheDocument();
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

    expect(await screen.findByText("42 items")).toBeInTheDocument();
    expect(screen.getByText("7 items")).toBeInTheDocument();
  });
});
