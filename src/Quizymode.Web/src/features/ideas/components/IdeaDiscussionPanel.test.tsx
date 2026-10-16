import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <IdeaDiscussionPanel ideaId="idea-1" canPost />
    </QueryClientProvider>
  );
}

describe("IdeaDiscussionPanel composer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    mockIdeasApi.getComments.mockResolvedValue({ comments: [] });
    mockIdeasApi.createComment.mockResolvedValue({});
  });

  it("shows a character counter and blocks comments under 3 letters or digits", async () => {
    const user = userEvent.setup();
    renderPanel();

    const textarea = screen.getByLabelText(/new comment/i);
    const postButton = screen.getByRole("button", { name: /post comment/i });

    expect(screen.getByText("0/2000")).toBeInTheDocument();
    expect(postButton).toBeDisabled();

    await user.type(textarea, "ok!");

    expect(screen.getByText("3/2000")).toBeInTheDocument();
    expect(
      screen.getByText("Comment must contain at least 3 letters or digits.")
    ).toBeInTheDocument();
    expect(textarea).toHaveAttribute("aria-invalid", "true");
    expect(postButton).toBeDisabled();

    await user.click(postButton);
    expect(mockIdeasApi.createComment).not.toHaveBeenCalled();
  });

  it("posts a valid trimmed comment", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText(/new comment/i), "  Looks good  ");

    const postButton = screen.getByRole("button", { name: /post comment/i });
    expect(postButton).toBeEnabled();
    expect(
      screen.queryByText("Comment must contain at least 3 letters or digits.")
    ).not.toBeInTheDocument();

    await user.click(postButton);

    expect(mockIdeasApi.createComment).toHaveBeenCalledWith("idea-1", {
      text: "Looks good",
    });
  });
});
