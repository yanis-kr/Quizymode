import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import ItemDetailPage from "./ItemDetailPage";
import { itemsApi } from "@/api/items";

const authState = vi.hoisted(() => ({ isAuthenticated: false, currentUserId: null as string | null }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: authState.isAuthenticated,
    userId: authState.isAuthenticated ? "sub-1" : null,
    isAdmin: false,
  }),
}));

vi.mock("@/hooks/useCurrentUserId", () => ({
  useCurrentUserId: () => authState.currentUserId,
}));

vi.mock("@/api/items", () => ({
  itemsApi: {
    getById: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/media/curatedImages", () => ({
  resolveCuratedImage: (key: string) => (key === "curated:flags/fr" ? "/assets/m/fr.webp" : null),
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
  it("shows the curated question picture under the question (#407, AC 2.3.7)", async () => {
    vi.mocked(itemsApi.getById).mockResolvedValue({
      ...item,
      questionImage: { key: "curated:flags/fr", altText: "Three vertical bands" },
    } as Awaited<ReturnType<typeof itemsApi.getById>>);

    renderPage("/items/item-1");

    expect(await screen.findByAltText("Three vertical bands")).toHaveAttribute("src", "/assets/m/fr.webp");
  });

  it("shows no picture for a text-only item", async () => {
    vi.mocked(itemsApi.getById).mockResolvedValue(item as Awaited<ReturnType<typeof itemsApi.getById>>);

    renderPage("/items/item-1");

    await screen.findByText("Item details");
    expect(screen.queryByTestId("question-image")).not.toBeInTheDocument();
  });

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

  it.each(["%2F%2Fevil.com", "%2F%5Cevil.com", "https%3A%2F%2Fevil.com", "javascript%3Aalert(1)"])(
    "ignores an unsafe return value %s and shows no back-to-quiz or explore target (AC 4.3.5c)",
    async (bad) => {
      vi.mocked(itemsApi.getById).mockResolvedValue(
        item as Awaited<ReturnType<typeof itemsApi.getById>>
      );

      renderPage(`/items/item-1?return=${bad}&returnMode=quiz`);

      await screen.findByText("Item details");
      expect(screen.queryByRole("button", { name: /^back/i })).not.toBeInTheDocument();
    }
  );

  describe("delete failures (#286)", () => {
    afterEach(() => {
      authState.isAuthenticated = false;
      authState.currentUserId = null;
      vi.restoreAllMocks();
    });

    it.each([
      [401, "Your session has expired. Please sign in again."],
      [403, "You can only delete your own items."],
      [404, "This item no longer exists."],
      [500, "Failed to delete item."],
    ])("shows a clear message for a %s delete failure and stays on the page", async (status, message) => {
      // AC 2.1.14
      authState.isAuthenticated = true;
      authState.currentUserId = "user-1";
      vi.spyOn(window, "confirm").mockReturnValue(true);
      vi.mocked(itemsApi.getById).mockResolvedValue(
        item as Awaited<ReturnType<typeof itemsApi.getById>>
      );
      vi.mocked(itemsApi.delete).mockRejectedValueOnce({ response: { status } });

      const user = userEvent.setup({ delay: null });
      renderPage("/items/item-1");
      await user.click(await screen.findByRole("button", { name: /delete/i }));

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.getByTestId("location")).toHaveTextContent("/items/item-1");
    });
  });
});
