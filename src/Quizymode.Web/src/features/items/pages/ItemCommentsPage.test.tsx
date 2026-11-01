import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import ItemCommentsPage from "./ItemCommentsPage";
import { commentsApi } from "@/api/comments";

vi.mock("@/api/comments", () => ({
  commentsApi: {
    getByItemId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: false }),
}));

vi.mock("@/hooks/useCurrentUserId", () => ({
  useCurrentUserId: () => null,
}));

vi.mock("@/components/LoadingSpinner", () => ({
  default: () => <div>Loading...</div>,
}));

vi.mock("@/components/ErrorMessage", () => ({
  default: ({ message }: { message: string }) => <div>{message}</div>,
}));

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderPage(initialEntry: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/items/:id/comments"
            element={
              <>
                <ItemCommentsPage />
                <LocationDisplay />
              </>
            }
          />
          <Route path="/explore/item/:itemId" element={<LocationDisplay />} />
          <Route path="/quiz/exams/item/:itemId" element={<LocationDisplay />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ItemCommentsPage return URL (AC 4.3.5c)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(commentsApi.getByItemId).mockResolvedValue({
      comments: [],
    } as unknown as Awaited<ReturnType<typeof commentsApi.getByItemId>>);
  });

  it("navigates back to a safe same-origin return path", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage("/items/item-1/comments?return=%2Fquiz%2Fexams%2Fitem%2Fitem-1");

    await user.click(await screen.findByRole("button", { name: /back to item/i }));

    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/quiz/exams/item/item-1")
    );
  });

  it.each(["%2F%2Fevil.com", "%2F%5Cevil.com", "https%3A%2F%2Fevil.com"])(
    "ignores the unsafe return value %s and falls back to the default back target",
    async (bad) => {
      const user = userEvent.setup({ delay: null });
      renderPage(`/items/item-1/comments?return=${bad}`);

      await user.click(await screen.findByRole("button", { name: /back to item/i }));

      await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/explore/item/item-1"));
      expect(screen.getByTestId("location")).not.toHaveTextContent("evil");
    }
  );
});
