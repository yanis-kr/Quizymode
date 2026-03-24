import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import QuizModePage from "./QuizModePage";
import { itemsApi } from "@/api/items";
import { categoriesApi } from "@/api/categories";
import { keywordsApi } from "@/api/keywords";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: true,
  }),
}));

vi.mock("@/api/items", () => ({
  itemsApi: {
    getRandom: vi.fn(),
    getById: vi.fn(),
    getAll: vi.fn(),
  },
}));

vi.mock("@/api/categories", () => ({
  categoriesApi: {
    getAll: vi.fn(),
  },
}));

vi.mock("@/api/keywords", () => ({
  keywordsApi: {
    getKeywordDescriptions: vi.fn(),
  },
}));

vi.mock("@/api/collections", () => ({
  collectionsApi: {
    getItems: vi.fn(),
    getById: vi.fn(),
    getRating: vi.fn(),
  },
}));

vi.mock("@/components/CommentsDrawer", () => ({
  CommentsDrawer: () => null,
}));

vi.mock("@/components/study/QuizRenderer", () => ({
  QuizRenderer: () => <div>Quiz Renderer</div>,
}));

vi.mock("@/components/ItemCollectionsModal", () => ({
  default: () => null,
}));

vi.mock("@/components/ItemRatingsComments", () => ({
  default: () => null,
}));

vi.mock("@/components/ItemCollectionControls", () => ({
  ItemCollectionControls: () => null,
}));

const item = {
  id: "item-1",
  category: "exams",
  isPrivate: false,
  question: "What is 2 + 2?",
  correctAnswer: "4",
  incorrectAnswers: ["1", "2", "3"],
  explanation: "Basic arithmetic.",
  createdAt: "2026-03-22T00:00:00Z",
  keywords: [],
  collections: [],
};

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
            path="/quiz/:category/item/:itemId"
            element={
              <>
                <QuizModePage />
                <LocationDisplay />
              </>
            }
          />
          <Route path="/categories/:category/:kw1/:kw2" element={<LocationDisplay />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("QuizModePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();

    vi.mocked(categoriesApi.getAll).mockResolvedValue({
      categories: [{ category: "exams" }],
    } as Awaited<ReturnType<typeof categoriesApi.getAll>>);

    vi.mocked(itemsApi.getRandom).mockResolvedValue({
      items: [item],
    } as Awaited<ReturnType<typeof itemsApi.getRandom>>);

    vi.mocked(itemsApi.getAll).mockResolvedValue({
      items: [item],
      totalCount: 623,
      page: 1,
      pageSize: 1,
      totalPages: 623,
    } as Awaited<ReturnType<typeof itemsApi.getAll>>);

    vi.mocked(itemsApi.getById).mockResolvedValue(
      item as Awaited<ReturnType<typeof itemsApi.getById>>
    );

    vi.mocked(keywordsApi.getKeywordDescriptions).mockResolvedValue({
      keywords: [
        { description: "ACT exam" },
        { description: "Math section" },
      ],
    } as Awaited<ReturnType<typeof keywordsApi.getKeywordDescriptions>>);
  });

  it("shows the shared leaf scope header and keeps Sets hidden in quiz mode", async () => {
    const user = userEvent.setup({ delay: null });

    renderPage(
      "/quiz/exams/item/item-1?nav=act,math&keywords=act,math,algebra"
    );

    expect(
      await screen.findByText(/Test your knowledge with interactive quizzes/i)
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/item count/i)).toHaveTextContent("(623)");
    expect(screen.getByRole("button", { name: "act" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "math" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "algebra" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: /sets/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /Quiz Mode/i })
    ).not.toBeInTheDocument();

    await waitFor(() =>
      expect(keywordsApi.getKeywordDescriptions).toHaveBeenCalledWith("exams", [
        "act",
        "math",
      ])
    );

    await waitFor(() =>
      expect(itemsApi.getAll).toHaveBeenCalledWith(
        "exams",
        undefined,
        ["algebra"],
        undefined,
        undefined,
        1,
        1,
        { navigationKeywords: ["act", "math"] }
      )
    );

    await user.click(screen.getByRole("tab", { name: /list/i }));

    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/categories/exams/act/math?view=items&keywords=algebra"
      )
    );
  });
});
