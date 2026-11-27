import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole("button", { name: "Try again" }));

    await waitFor(() => expect(commentsApi.getByItemId).toHaveBeenCalledTimes(2));
  });
});

describe("CommentsDrawer navigation wording (#923)", () => {
  it("AC 3.6.49 AC 3.6.50 names the arrows Previous question and Next question, and they open the same neighbours", async () => {
    vi.mocked(commentsApi.getByItemId).mockResolvedValue({ comments: [] } as never);
    const onNavigate = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <CommentsDrawer itemId="item-2" onClose={() => {}} onNavigateToItem={onNavigate} previousItemId="item-1" nextItemId="item-3" />
      </QueryClientProvider>
    );

    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByTitle("Previous question"));
    await user.click(screen.getByTitle("Next question"));

    expect(onNavigate.mock.calls).toEqual([["item-1"], ["item-3"]]);
    expect(screen.queryByTitle(/\bitem\b/i)).toBeNull();
  });
});
