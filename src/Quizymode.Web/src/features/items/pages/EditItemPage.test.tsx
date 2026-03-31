import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import EditItemPage from "./EditItemPage";
import { itemsApi } from "@/api/items";
import { taxonomyApi } from "@/api/taxonomy";
import { useAuth } from "@/contexts/AuthContext";
import { useExtraKeywordAutocompleteSource } from "@/hooks/useExtraKeywordAutocompleteSource";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/api/items", () => ({
  itemsApi: {
    getById: vi.fn(),
    update: vi.fn(),
    setVisibility: vi.fn(),
  },
}));

vi.mock("@/api/taxonomy", () => ({
  taxonomyApi: {
    getAll: vi.fn(),
  },
}));

vi.mock("@/hooks/useExtraKeywordAutocompleteSource", () => ({
  useExtraKeywordAutocompleteSource: vi.fn(() => ({
    extraKeywordAutocompleteSource: [],
    itemTagKeywordsLoading: false,
  })),
}));

vi.mock("@/components/LoadingSpinner", () => ({ default: () => <div>Loading...</div> }));
vi.mock("@/components/ErrorMessage", () => ({
  default: ({ message }: { message: string }) => <div>{message}</div>,
}));

const taxonomyMock = {
  categories: [
    {
      slug: "science",
      name: "Science",
      description: "",
      itemCount: 0,
      allKeywordSlugs: ["anatomy", "muscular"],
      groups: [
        {
          slug: "anatomy",
          description: null,
          itemCount: 0,
          keywords: [{ slug: "muscular", description: null, itemCount: 0 }],
        },
      ],
    },
  ],
};

const itemMock = {
  id: "item-1",
  category: "science",
  isPrivate: true,
  question: "Old question?",
  correctAnswer: "Old answer",
  incorrectAnswers: ["W1", "W2", "W3"],
  explanation: "Old explanation",
  createdAt: "2026-01-01T00:00:00Z",
  createdBy: "user-1",
  keywords: [],
  collections: [],
  navigationBreadcrumb: ["anatomy", "muscular"],
  source: null,
  factualRisk: null,
  reviewComments: null,
  readyForReview: false,
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
            path="/items/:id/edit"
            element={
              <>
                <EditItemPage />
                <LocationDisplay />
              </>
            }
          />
          <Route path="/categories" element={<LocationDisplay />} />
          <Route path="/login" element={<div>Login</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("EditItemPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      userId: "user-1",
      isAdmin: false,
    } as ReturnType<typeof useAuth>);

    vi.mocked(taxonomyApi.getAll).mockResolvedValue(
      taxonomyMock as Awaited<ReturnType<typeof taxonomyApi.getAll>>
    );

    vi.mocked(itemsApi.getById).mockResolvedValue(
      itemMock as Awaited<ReturnType<typeof itemsApi.getById>>
    );

    vi.mocked(itemsApi.update).mockResolvedValue(
      { id: "item-1", ...itemMock } as Awaited<ReturnType<typeof itemsApi.update>>
    );

    vi.mocked(useExtraKeywordAutocompleteSource).mockReturnValue({
      extraKeywordAutocompleteSource: [],
      itemTagKeywordsLoading: false,
    });
  });

  it("regular user sees readyForReview checkbox", async () => {
    // AC 2.1.4
    renderPage("/items/item-1/edit");

    // Wait for the form to load by checking for the save button
    await screen.findByRole("button", { name: /save changes/i });

    expect(
      screen.getByText(/request admin review to make this item public/i)
    ).toBeInTheDocument();
  });

  it("admin user sees isPrivate toggle", async () => {
    // AC 2.1.3
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      userId: "user-1",
      isAdmin: true,
    } as ReturnType<typeof useAuth>);

    renderPage("/items/item-1/edit");

    // Wait for the form to load
    await screen.findByRole("button", { name: /save changes/i });

    // Admin sees the Private Item checkbox (enabled)
    const privateCheckbox = screen.getByRole("checkbox", { name: /private item/i });
    expect(privateCheckbox).toBeInTheDocument();
    expect(privateCheckbox).not.toBeDisabled();
  });

  it("calls update API with correct payload on submit", async () => {
    // AC 2.1.5/2.1.6
    const user = userEvent.setup({ delay: null });

    renderPage("/items/item-1/edit");

    const saveButton = await screen.findByRole("button", { name: /save changes/i });

    await user.click(saveButton);

    await waitFor(() =>
      expect(itemsApi.update).toHaveBeenCalledWith(
        "item-1",
        expect.objectContaining({
          category: "science",
          navigationKeyword1: "anatomy",
          navigationKeyword2: "muscular",
        })
      )
    );
  });
});
