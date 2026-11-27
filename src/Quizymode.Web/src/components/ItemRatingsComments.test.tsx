import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import ItemRatingsComments from "./ItemRatingsComments";
import { ratingsApi } from "@/api/ratings";
import { commentsApi } from "@/api/comments";
import userEvent from "@testing-library/user-event";
import { refusal } from "@/test/refusal";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: true,
  }),
}));

vi.mock("@/api/ratings", () => ({
  ratingsApi: {
    getStats: vi.fn(),
    getUserRating: vi.fn(),
    createOrUpdate: vi.fn(),
  },
}));

vi.mock("@/api/comments", () => ({
  commentsApi: {
    getByItemId: vi.fn(),
  },
}));

function renderItemRatingsComments() {
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
        <ItemRatingsComments itemId="item-1" presentation="list-card" />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ItemRatingsComments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ratingsApi.getStats).mockResolvedValue({
      itemId: "item-1",
      averageStars: 4.5,
      count: 6,
    });
    vi.mocked(ratingsApi.getUserRating).mockResolvedValue({
      id: "rating-1",
      itemId: "item-1",
      stars: 3,
      createdAt: "2026-04-11T12:00:00Z",
      updatedAt: "2026-04-11T12:00:00Z",
    });
    vi.mocked(commentsApi.getByItemId).mockResolvedValue({
      comments: Array.from({ length: 12 }, (_, index) => ({
        id: `comment-${index}`,
        itemId: "item-1",
        text: `Comment ${index}`,
        createdBy: "user-1",
        createdAt: "2026-04-11T12:00:00Z",
      })),
      totalCount: 12,
      page: 1,
      pageSize: 1,
    });
    vi.mocked(ratingsApi.createOrUpdate).mockResolvedValue({
      id: "rating-1",
      itemId: "item-1",
      stars: 4,
      createdAt: "2026-04-11T12:00:00Z",
      updatedAt: "2026-04-11T12:01:00Z",
    });
  });

  it("hides the aggregate summary in list-card mode and keeps the comments label on one line", async () => {
    renderItemRatingsComments();

    const commentsButton = await screen.findByRole("button", {
      name: "Comments (12)",
    });

    await waitFor(() => {
      expect(screen.queryByText("4.5")).not.toBeInTheDocument();
      expect(screen.queryByText("(6)")).not.toBeInTheDocument();
    });
    expect(commentsButton.className).toContain("whitespace-nowrap");
  });

  it("AC 2.5.11 counts the server total, not the loaded comments, and asks for one comment", async () => {
    vi.mocked(commentsApi.getByItemId).mockResolvedValue({
      comments: [], totalCount: 212, page: 1, pageSize: 1,
    });

    renderItemRatingsComments();

    expect(await screen.findByRole("button", { name: "Comments (212)" })).toBeInTheDocument();
    expect(commentsApi.getByItemId).toHaveBeenCalledWith("item-1", 1, 1);
  });

  it("AC 17.8 shows the server message for a refused rating and does not retry", async () => {
    vi.mocked(ratingsApi.createOrUpdate).mockRejectedValue(refusal("Too many changes in a short time."));
    const user = userEvent.setup({ delay: null });
    renderItemRatingsComments();
    await waitFor(() => expect(ratingsApi.getUserRating).toHaveBeenCalled());
    const fifth = screen.getByTitle("Rate 5 stars");
    const before = fifth.innerHTML;

    await user.click(fifth);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Too many changes in a short time.");
    expect(alert).not.toHaveTextContent("429");
    expect(fifth.innerHTML).toBe(before);
    expect(ratingsApi.createOrUpdate).toHaveBeenCalledTimes(1);
  });
});
