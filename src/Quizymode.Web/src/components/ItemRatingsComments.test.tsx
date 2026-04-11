import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import ItemRatingsComments from "./ItemRatingsComments";
import { ratingsApi } from "@/api/ratings";
import { commentsApi } from "@/api/comments";

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
});
