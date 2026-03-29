import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import ItemDetailPage from "./ItemDetailPage";
import { itemsApi } from "@/api/items";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: false,
    userId: null,
    isAdmin: false,
  }),
}));

vi.mock("@/api/items", () => ({
  itemsApi: {
    getById: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/components/LoadingSpinner", () => ({
  default: () => <div>Loading...</div>,
}));

vi.mock("@/components/ErrorMessage", () => ({
  default: ({ message }: { message: string }) => <div>{message}</div>,
}));

vi.mock("@/components/ItemRatingsComments", () => ({
  default: () => null,
}));

const item = {
  id: "item-1",
  category: "science",
  isPrivate: false,
  question: "Question",
  correctAnswer: "Answer",
  incorrectAnswers: ["A", "B", "C"],
  explanation: "Explanation",
  createdAt: "2026-03-22T00:00:00Z",
  createdBy: "user-1",
  keywords: [],
  collections: [],
  navigationBreadcrumb: [],
  source: null,
  factualRisk: null,
  reviewComments: null,
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
            path="/items/:id"
            element={
              <>
                <ItemDetailPage />
                <LocationDisplay />
              </>
            }
          />
          <Route path="/quiz/collections/:collectionId/:slug/item/:itemId" element={<LocationDisplay />} />
          <Route path="/explore/collections/:collectionId/:slug/item/:itemId" element={<LocationDisplay />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ItemDetailPage", () => {
  it("shows a back-to-quiz button when opened from quiz details and returns to the same URL", async () => {
    vi.mocked(itemsApi.getById).mockResolvedValue(
      item as Awaited<ReturnType<typeof itemsApi.getById>>
    );

    const user = userEvent.setup({ delay: null });
    renderPage(
      "/items/item-1?return=%2Fquiz%2Fcollections%2Fcollection-1%2Fsample%2Bcollection%2Fitem%2Fitem-1%3Fkeywords%3Dspace&returnMode=quiz"
    );

    expect(await screen.findByRole("button", { name: /back to quiz/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /back to quiz/i }));

    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/quiz/collections/collection-1/sample+collection/item/item-1?keywords=space"
      )
    );
  });

  it("infers a back-to-explore button from the return URL when returnMode is missing", async () => {
    vi.mocked(itemsApi.getById).mockResolvedValue(
      item as Awaited<ReturnType<typeof itemsApi.getById>>
    );

    const user = userEvent.setup({ delay: null });
    renderPage(
      "/items/item-1?return=%2Fexplore%2Fcollections%2Fcollection-1%2Fsample%2Bcollection%2Fitem%2Fitem-1%3Fkeywords%3Dspace"
    );

    expect(await screen.findByRole("button", { name: /back to explore/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /back to explore/i }));

    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/explore/collections/collection-1/sample+collection/item/item-1?keywords=space"
      )
    );
  });
});
