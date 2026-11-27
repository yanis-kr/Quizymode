import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import ItemCommentsPage from "./ItemCommentsPage";
import { commentsApi } from "@/api/comments";
import { refusal } from "@/test/refusal";

vi.mock("@/api/comments", () => ({
  commentsApi: {
    getByItemId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

const auth = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: !!auth.userId }),
}));

vi.mock("@/hooks/useCurrentUserId", () => ({
  useCurrentUserId: () => auth.userId,
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

  it("AC 3.6.49 AC 3.6.50 Back to question navigates to a safe same-origin return path", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage("/items/item-1/comments?return=%2Fquiz%2Fexams%2Fitem%2Fitem-1");

    await user.click(await screen.findByRole("button", { name: /back to question/i }));

    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/quiz/exams/item/item-1")
    );
  });

  it.each(["%2F%2Fevil.com", "%2F%5Cevil.com", "https%3A%2F%2Fevil.com"])(
    "ignores the unsafe return value %s and falls back to the default back target",
    async (bad) => {
      const user = userEvent.setup({ delay: null });
      renderPage(`/items/item-1/comments?return=${bad}`);

      await user.click(await screen.findByRole("button", { name: /back to question/i }));

      await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/explore/item/item-1"));
      expect(screen.getByTestId("location")).not.toHaveTextContent("evil");
    }
  );
});

describe("ItemCommentsPage paging and refused saves", () => {
  const response = (id: string, page: number, totalCount: number) =>
    ({
      comments: [{ id, itemId: "item-1", text: `Text ${id}`, createdBy: "user-1", createdAt: "2026-01-01T00:00:00Z" }],
      totalCount,
      page,
      pageSize: 50,
    }) as Awaited<ReturnType<typeof commentsApi.getByItemId>>;

  beforeEach(() => {
    vi.resetAllMocks();
    auth.userId = "user-1";
  });

  it("AC 2.5.16 appends older comments to the loaded ones", async () => {
    vi.mocked(commentsApi.getByItemId)
      .mockResolvedValueOnce(response("a", 1, 51))
      .mockResolvedValueOnce(response("b", 2, 51));
    const user = userEvent.setup({ delay: null });
    renderPage("/items/item-1/comments");

    await user.click(await screen.findByRole("button", { name: "Load older comments" }));

    expect(await screen.findByText("Text b")).toBeInTheDocument();
    expect(screen.getByText("Text a")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load older comments" })).toBeNull();
  });

  it("AC 2.5.17 keeps the typed comment and shows the server message when posting is refused", async () => {
    vi.mocked(commentsApi.getByItemId).mockResolvedValue(response("a", 1, 1));
    vi.mocked(commentsApi.create).mockRejectedValue(refusal("Daily comment limit reached."));
    const user = userEvent.setup({ delay: null });
    renderPage("/items/item-1/comments");
    const box = await screen.findByPlaceholderText("Write your comment...");
    await user.type(box, "Keep me");

    await user.click(screen.getByRole("button", { name: "Post Comment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Daily comment limit reached.");
    expect(box).toHaveValue("Keep me");
  });

  it("AC 2.5.17 stays in edit mode when saving an edit fails", async () => {
    vi.mocked(commentsApi.getByItemId).mockResolvedValue(response("a", 1, 1));
    vi.mocked(commentsApi.update).mockRejectedValue(new Error("network down"));
    const user = userEvent.setup({ delay: null });
    renderPage("/items/item-1/comments");
    await user.click(await screen.findByTitle("Edit comment"));

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save your changes. Please try again.");
    expect(screen.getByDisplayValue("Text a")).toBeInTheDocument();
  });
});
