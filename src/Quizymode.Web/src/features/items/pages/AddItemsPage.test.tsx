import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import AddItemsPage from "./AddItemsPage";
import { categoriesApi } from "@/api/categories";
import { keywordsApi } from "@/api/keywords";
import { taxonomyApi } from "@/api/taxonomy";
import { useExtraKeywordAutocompleteSource } from "@/hooks/useExtraKeywordAutocompleteSource";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: true,
  }),
}));

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

vi.mock("@/hooks/useExtraKeywordAutocompleteSource", () => ({
  useExtraKeywordAutocompleteSource: vi.fn(),
}));

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderPage(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/items/add"
            element={
              <>
                <AddItemsPage />
                <LocationDisplay />
              </>
            }
          />
          <Route
            path="/add-new-item"
            element={
              <>
                <div>Create Route</div>
                <LocationDisplay />
              </>
            }
          />
          <Route
            path="/study-guide/import"
            element={
              <>
                <div>Study Guide Import Route</div>
                <LocationDisplay />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("AddItemsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(categoriesApi.getAll).mockResolvedValue({
      categories: [
        {
          category: "science",
        },
      ],
    } as Awaited<ReturnType<typeof categoriesApi.getAll>>);

    vi.mocked(keywordsApi.getNavigationKeywords).mockImplementation(
      async (_category, selectedKeywords) => ({
        keywords:
          selectedKeywords && selectedKeywords.length > 0
            ? [{ name: "muscular", itemCount: 0, averageRating: null, navigationRank: 2 }]
            : [{ name: "anatomy", itemCount: 0, averageRating: null, navigationRank: 1 }],
      })
    );

    vi.mocked(taxonomyApi.getAll).mockResolvedValue({
      categories: [
        {
          slug: "science",
          description: "",
          allKeywordSlugs: ["anatomy", "muscular", "arms", "arteries"],
          groups: [],
        },
      ],
    });

    vi.mocked(useExtraKeywordAutocompleteSource).mockReturnValue({
      extraKeywordAutocompleteSource: ["arms", "arteries"],
      itemTagKeywordsLoading: false,
    });
  });

  it("shows autocomplete suggestions for additional keywords and applies the selection", async () => {
    const user = userEvent.setup({ delay: null });

    renderPage("/items/add?category=science&keywords=anatomy,muscular");

    const input = await screen.findByLabelText(/additional keywords/i);
    await user.type(input, "ar");

    expect(await screen.findByRole("option", { name: "arms" })).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "arms" }));

    await waitFor(() => expect(input).toHaveValue("arms"));

    const location = screen.getByTestId("location").textContent ?? "";
    expect(decodeURIComponent(location)).toContain(
      "/items/add?category=science&keywords=anatomy,muscular,arms"
    );
  });

  it("navigates to the manual-entry route while preserving scope", async () => {
    const user = userEvent.setup({ delay: null });

    renderPage("/items/add?category=science&keywords=anatomy,muscular,arms");

    await user.click(await screen.findByRole("button", { name: /add manually/i }));

    expect(await screen.findByText("Create Route")).toBeInTheDocument();

    const location = screen.getByTestId("location").textContent ?? "";
    expect(decodeURIComponent(location)).toContain(
      "/add-new-item?category=science&keywords=anatomy,muscular,arms"
    );
  });

  it("navigates to the study-guide prompt-set route while preserving scope", async () => {
    const user = userEvent.setup({ delay: null });

    renderPage("/items/add?category=science&keywords=anatomy,muscular,arms");

    await user.click(
      await screen.findByRole("button", {
        name: /generate ai sets from study guide/i,
      })
    );

    expect(await screen.findByText("Study Guide Import Route")).toBeInTheDocument();

    const location = screen.getByTestId("location").textContent ?? "";
    expect(decodeURIComponent(location)).toContain(
      "/study-guide/import?category=science&keywords=anatomy,muscular,arms"
    );
  });
});
