import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import IdeaDiscussionPanel from "./IdeaDiscussionPanel";

const { mockUseAuth, mockIdeasApi } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockIdeasApi: {
    getComments: vi.fn(),
    createComment: vi.fn(),
    updateComment: vi.fn(),
    deleteComment: vi.fn(),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/api/ideas", () => ({
  ideasApi: mockIdeasApi,
}));

const ownComment = {
  id: "c-own",
  ideaId: "idea-1",
  text: "My own comment",
  authorName: "Me",
  createdAt: "2026-04-01T10:00:00Z",
  updatedAt: null,
  canEdit: true,
  canDelete: true,
};

const otherComment = {
  id: "c-other",
  ideaId: "idea-1",
  text: "Someone else's comment",
  authorName: "Other",
  createdAt: "2026-04-01T11:00:00Z",
  updatedAt: null,
  canEdit: false,
  canDelete: false,
};

function apiError(status: number, title: string, detail: string) {
  const error = new AxiosError("Request failed");
  error.response = {
    status,
    statusText: "",
    headers: {},
    config: {} as never,
    data: { title, detail },
  };
  return error;
}

function renderPanel(canPost = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <IdeaDiscussionPanel ideaId="idea-1" canPost={canPost} />
    </QueryClientProvider>
  );
}

describe("IdeaDiscussionPanel comment CRUD", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    mockIdeasApi.getComments.mockResolvedValue({
      comments: [ownComment, otherComment],
    });
    mockIdeasApi.updateComment.mockResolvedValue(ownComment);
    mockIdeasApi.deleteComment.mockResolvedValue(undefined);
    mockIdeasApi.createComment.mockResolvedValue(ownComment);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("only offers edit and delete on comments the API marks as editable", async () => {
    renderPanel();

    await screen.findByText("My own comment");
    expect(screen.getByText("Someone else's comment")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Edit comment" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Delete comment" })).toHaveLength(1);
  });

  it("shows delete without edit when only canDelete is granted (admin moderation)", async () => {
    mockIdeasApi.getComments.mockResolvedValue({
      comments: [{ ...otherComment, canDelete: true }],
    });

    renderPanel();

    await screen.findByText("Someone else's comment");
    expect(screen.queryByRole("button", { name: "Edit comment" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete comment" })).toBeInTheDocument();
  });

  it("edits a comment and saves the trimmed text", async () => {
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText("My own comment");
    await user.click(screen.getByRole("button", { name: "Edit comment" }));

    const textarea = screen.getByLabelText("Edit comment text");
    expect(textarea).toHaveValue("My own comment");
    await user.clear(textarea);
    await user.type(textarea, "  Updated wording  ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockIdeasApi.updateComment).toHaveBeenCalledWith("idea-1", "c-own", {
        text: "Updated wording",
      })
    );
  });

  it("blocks saving an edit that has too few meaningful characters", async () => {
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText("My own comment");
    await user.click(screen.getByRole("button", { name: "Edit comment" }));
    const textarea = screen.getByLabelText("Edit comment text");
    await user.clear(textarea);
    await user.type(textarea, "ok!");

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(mockIdeasApi.updateComment).not.toHaveBeenCalled();
  });

  it("cancelling an edit restores the read-only comment", async () => {
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText("My own comment");
    await user.click(screen.getByRole("button", { name: "Edit comment" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText("Edit comment text")).not.toBeInTheDocument();
    expect(screen.getByText("My own comment")).toBeInTheDocument();
    expect(mockIdeasApi.updateComment).not.toHaveBeenCalled();
  });

  it("deletes a comment after confirmation", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPanel();

    await screen.findByText("My own comment");
    await user.click(screen.getByRole("button", { name: "Delete comment" }));

    await waitFor(() =>
      expect(mockIdeasApi.deleteComment).toHaveBeenCalledWith("idea-1", "c-own")
    );
  });

  it("does not delete when the confirmation is dismissed", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPanel();

    await screen.findByText("My own comment");
    await user.click(screen.getByRole("button", { name: "Delete comment" }));

    expect(mockIdeasApi.deleteComment).not.toHaveBeenCalled();
  });

  it("renders the API error when posting a comment fails", async () => {
    const user = userEvent.setup();
    mockIdeasApi.createComment.mockRejectedValue(
      apiError(500, "IdeaComments.CreateFailed", "Database is down")
    );
    renderPanel();

    await screen.findByText("My own comment");
    await user.type(screen.getByLabelText(/new comment/i), "A fine comment");
    await user.click(screen.getByRole("button", { name: /post comment/i }));

    expect(await screen.findByText("Idea discussion update failed")).toBeInTheDocument();
    expect(screen.getByText("[500] Database is down")).toBeInTheDocument();
  });

  it("renders an error state with retry when comments fail to load", async () => {
    mockIdeasApi.getComments.mockRejectedValueOnce(new Error("network down"));
    renderPanel();

    expect(await screen.findByText("Failed to load comments")).toBeInTheDocument();
  });

  it("shows the empty state when there are no comments", async () => {
    mockIdeasApi.getComments.mockResolvedValue({ comments: [] });
    renderPanel();

    expect(await screen.findByText("No comments yet.")).toBeInTheDocument();
  });

  it("hides the composer and explains why when posting is disabled", async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false });
    renderPanel(false);

    await screen.findByText("My own comment");
    expect(screen.queryByLabelText(/new comment/i)).not.toBeInTheDocument();
    expect(screen.getByText("Sign in to join the discussion.")).toBeInTheDocument();
  });
});
