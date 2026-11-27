import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CommentsDrawer } from "./CommentsDrawer";
import { commentsApi } from "@/api/comments";
import { refusal } from "@/test/refusal";

const auth = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: !!auth.userId }),
}));

vi.mock("@/hooks/useCurrentUserId", () => ({
  useCurrentUserId: () => auth.userId,
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

const comment = (n: number) => ({
  id: `c${n}`,
  itemId: "item-1",
  text: `Comment ${n}`,
  createdBy: "user-1",
  createdAt: "2026-01-01T00:00:00Z",
});
const page = (numbers: number[], pageNumber: number, totalCount: number) => ({
  comments: numbers.map(comment),
  totalCount,
  page: pageNumber,
  pageSize: 50,
});
const range = (from: number, count: number) => Array.from({ length: count }, (_, index) => from + index);

describe("CommentsDrawer older comments (AC 2.5.16)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.userId = null;
  });

  it("loads the next page, shows a comment repeated across pages once, then hides the button", async () => {
    vi.mocked(commentsApi.getByItemId)
      .mockResolvedValueOnce(page(range(1, 50), 1, 55))
      .mockResolvedValueOnce(page(range(50, 6), 2, 55));
    const user = userEvent.setup({ delay: null });
    renderDrawer();

    await user.click(await screen.findByRole("button", { name: "Load older comments" }));

    expect(await screen.findByText("Comment 55")).toBeInTheDocument();
    expect(screen.getAllByText("Comment 50")).toHaveLength(1);
    expect(commentsApi.getByItemId).toHaveBeenLastCalledWith("item-1", 2, 50);
    expect(screen.queryByRole("button", { name: "Load older comments" })).toBeNull();
  });

  it("shows no button when one page holds every comment", async () => {
    vi.mocked(commentsApi.getByItemId).mockResolvedValue(page([1], 1, 1));
    renderDrawer();

    await screen.findByText("Comment 1");
    expect(screen.queryByRole("button", { name: "Load older comments" })).toBeNull();
  });

  it("keeps the loaded comments and the draft when loading older ones fails, and retries from the same button", async () => {
    auth.userId = "user-2";
    vi.mocked(commentsApi.getByItemId)
      .mockResolvedValueOnce(page([1], 1, 51))
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(page([2], 2, 51));
    const user = userEvent.setup({ delay: null });
    renderDrawer();
    await user.type(await screen.findByPlaceholderText("Write your comment..."), "My draft");

    await user.click(screen.getByRole("button", { name: "Load older comments" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load older comments.");
    expect(screen.getByText("Comment 1")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Write your comment...")).toHaveValue("My draft");

    await user.click(screen.getByRole("button", { name: "Load older comments" }));
    expect(await screen.findByText("Comment 2")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("CommentsDrawer refused saves (AC 2.5.17)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.userId = "user-1";
    vi.mocked(commentsApi.getByItemId).mockResolvedValue(page([1], 1, 1));
  });

  it("shows the server message under the form and keeps the typed comment", async () => {
    vi.mocked(commentsApi.create).mockRejectedValue(refusal("Daily comment limit reached."));
    const user = userEvent.setup({ delay: null });
    renderDrawer();
    const box = await screen.findByPlaceholderText("Write your comment...");
    await user.type(box, "Keep me");

    await user.click(screen.getByRole("button", { name: "Post Comment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Daily comment limit reached.");
    expect(box).toHaveValue("Keep me");
    expect(screen.getByRole("button", { name: "Post Comment" })).toBeEnabled();
    expect(commentsApi.create).toHaveBeenCalledTimes(1);
  });

  it("stays in edit mode with the edited text and clears the message on Cancel", async () => {
    vi.mocked(commentsApi.update).mockRejectedValue(refusal("Too many requests."));
    const user = userEvent.setup({ delay: null });
    renderDrawer();
    await user.click(await screen.findByTitle("Edit"));
    const box = screen.getByDisplayValue("Comment 1");
    await user.type(box, " edited");

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests.");
    expect(box).toHaveValue("Comment 1 edited");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByTitle("Edit"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("clears a refusal when the drawer moves to another question", async () => {
    vi.mocked(commentsApi.create).mockRejectedValue(refusal("Daily comment limit reached."));
    const user = userEvent.setup({ delay: null });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const drawer = (itemId: string) => (
      <QueryClientProvider client={queryClient}>
        <CommentsDrawer itemId={itemId} onClose={() => {}} />
      </QueryClientProvider>
    );
    const view = render(drawer("item-1"));
    await user.type(await screen.findByPlaceholderText("Write your comment..."), "Keep me");
    await user.click(screen.getByRole("button", { name: "Post Comment" }));
    await screen.findByRole("alert");

    view.rerender(drawer("item-2"));

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
