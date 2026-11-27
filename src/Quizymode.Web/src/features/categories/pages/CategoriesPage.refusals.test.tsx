import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CategoriesPage from "./CategoriesPage";
import { categoriesApi } from "@/api/categories";
import { keywordsApi } from "@/api/keywords";
import { itemsApi } from "@/api/items";
import { featuredApi } from "@/api/featured";
import { ratingsApi } from "@/api/ratings";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import { refusal } from "@/test/refusal";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));
vi.mock("@/hooks/useCurrentUserId", () => ({ useCurrentUserId: () => "u1" }));
vi.mock("@/hooks/usePageSize", () => ({
  usePageSize: () => ({ pageSize: 20, updatePageSize: vi.fn() }),
  PAGE_SIZE_OPTIONS: [20, 50, 100],
}));
vi.mock("@/api/categories", () => ({ categoriesApi: { getAll: vi.fn() } }));
vi.mock("@/api/keywords", () => ({
  keywordsApi: { getNavigationKeywords: vi.fn(), getKeywordDescriptions: vi.fn(), getItemTagKeywords: vi.fn() },
}));
vi.mock("@/api/items", () => ({ itemsApi: { getAll: vi.fn(), exportItems: vi.fn() } }));
vi.mock("@/api/featured", () => ({ featuredApi: { get: vi.fn() } }));
vi.mock("@/api/ratings", () => ({ ratingsApi: { getStats: vi.fn() } }));
vi.mock("@/hooks/useListenAll", () => ({
  useListenAll: () => ({ listenState: "idle", handleButton: vi.fn(), isSupported: false }),
}));
vi.mock("@/components/ItemRatingsComments", () => ({ default: () => null }));
vi.mock("@/components/ItemCollectionsModal", () => ({ default: () => null }));
vi.mock("@/components/ItemCollectionControls", () => ({ ItemCollectionControls: () => null }));

function renderAt(url: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/categories/:category/:kw1/:kw2" element={<CategoriesPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

const LEAF = "/categories/trivia/brain-teasers/aha-moments?view=items";

describe("CategoriesPage refusals", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    installMemoryLocalStorage();
    vi.mocked(categoriesApi.getAll).mockResolvedValue({
      categories: [{ category: "Trivia", count: 1, description: "Fun.", averageRating: null }],
    } as never);
    vi.mocked(keywordsApi.getNavigationKeywords).mockResolvedValue({ keywords: [] });
    vi.mocked(keywordsApi.getKeywordDescriptions).mockResolvedValue({ keywords: [] });
    vi.mocked(keywordsApi.getItemTagKeywords).mockResolvedValue({ names: [] });
    vi.mocked(featuredApi.get).mockResolvedValue({ sets: [], collections: [] });
    vi.mocked(itemsApi.getAll).mockResolvedValue({
      items: [{
        id: "1", category: "Trivia", isPrivate: false, question: "Q one", correctAnswer: "A",
        incorrectAnswers: ["x"], explanation: "", createdAt: "2026-01-01T00:00:00Z", keywords: [], collections: [],
      }],
      totalCount: 1, page: 1, pageSize: 20, totalPages: 1,
    } as never);
    vi.mocked(ratingsApi.getStats).mockResolvedValue({ itemId: "1", averageStars: null, count: 0 });
  });

  it("AC 17.8 shows one message for a refused export", async () => {
    vi.mocked(itemsApi.exportItems).mockRejectedValue(refusal("Too many exports."));
    const user = userEvent.setup({ delay: null });
    renderAt(LEAF);
    const buttons = await screen.findAllByRole("button", { name: "Export" });

    await user.click(buttons[0]);

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Too many exports.")).toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByText("Q one")).toBeInTheDocument();
    expect(itemsApi.exportItems).toHaveBeenCalledTimes(1);
  });

  it("AC 17.11 shows a 429 on ratings as an error and does not treat the questions as unrated", async () => {
    vi.mocked(ratingsApi.getStats).mockRejectedValue(refusal("Too many requests."));

    renderAt(`${LEAF}&ratingOnlyUnrated=1`);

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
