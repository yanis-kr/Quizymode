import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CommentsDrawer } from "./CommentsDrawer";
import { commentsApi } from "@/api/comments";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: false }),
}));

vi.mock("@/hooks/useCurrentUserId", () => ({
  useCurrentUserId: () => null,
}));

vi.mock("@/api/comments", () => ({
  commentsApi: {
    getByItemId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

function renderDrawer() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CommentsDrawer itemId="item-1" onClose={() => {}} />
    </QueryClientProvider>
  );
}

describe("CommentsDrawer error state (#822)", () => {
  it("shows the plainer message when loading comments fails", async () => {
    vi.mocked(commentsApi.getByItemId).mockRejectedValue(new Error("network down"));

    renderDrawer();

    expect(await screen.findByText("Could not load comments. Try again.")).toBeInTheDocument();
    expect(screen.queryByText("Failed to load comments")).not.toBeInTheDocument();
  });

  it("keeps the retry control in the error state", async () => {
    vi.mocked(commentsApi.getByItemId).mockRejectedValue(new Error("network down"));

    renderDrawer();

    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
