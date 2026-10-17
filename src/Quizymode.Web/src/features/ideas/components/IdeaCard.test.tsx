import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import type { IdeaSummaryResponse } from "@/api/ideas";
import IdeaCard from "./IdeaCard";

const { mockUseAuth, mockIdeasApi } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockIdeasApi: {
    setRating: vi.fn(),
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

function makeIdea(overrides: Partial<IdeaSummaryResponse> = {}): IdeaSummaryResponse {
  return {
    id: "idea-1",
    title: "Improve study sessions",
    problem: "Learners lose context between study sessions.",
    proposedChange: "Add resumable sessions with a quick continue action.",
    tradeOffs: null,
    status: "Planned",
    moderationState: "Published",
    moderationNotes: null,
    authorName: "Quizymode",
    reviewedByName: null,
    createdAt: "2026-04-01T10:00:00Z",
    updatedAt: null,
    reviewedAt: null,
    commentCount: 1,
    ratingCount: 2,
    averageStars: 4,
    myRating: null,
    canEdit: false,
    canDelete: false,
    canChangeStatus: false,
    ...overrides,
  };
}

function renderCard(
  idea: IdeaSummaryResponse,
  props: Partial<React.ComponentProps<typeof IdeaCard>> = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <IdeaCard idea={idea} expanded={false} onToggleExpand={vi.fn()} {...props} />
    </QueryClientProvider>
  );
}

describe("IdeaCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    mockIdeasApi.setRating.mockResolvedValue({ stars: 5 });
    mockIdeasApi.getComments.mockResolvedValue({ comments: [] });
  });

  it("submits a star rating for a published idea", async () => {
    const user = userEvent.setup();
    renderCard(makeIdea());

    await user.click(screen.getByRole("button", { name: "Rate 5 stars" }));

    await waitFor(() =>
      expect(mockIdeasApi.setRating).toHaveBeenCalledWith("idea-1", { stars: 5 })
    );
  });

  it("clears the rating when the current star is clicked again", async () => {
    const user = userEvent.setup();
    mockIdeasApi.setRating.mockResolvedValue({ stars: null });
    renderCard(makeIdea({ myRating: 3 }));

    await user.click(screen.getByRole("button", { name: "Rate 3 stars" }));

    await waitFor(() =>
      expect(mockIdeasApi.setRating).toHaveBeenCalledWith("idea-1", { stars: null })
    );
  });

  it("does not allow rating when signed out", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false });
    renderCard(makeIdea());

    const star = screen.queryByRole("button", { name: "Rate 4 stars" });
    if (star) {
      expect(star).toBeDisabled();
    }
    expect(mockIdeasApi.setRating).not.toHaveBeenCalled();
  });

  it("shows an alert when the rating request fails", async () => {
    const user = userEvent.setup();
    const error = new AxiosError("Request failed");
    error.response = {
      status: 400,
      statusText: "",
      headers: {},
      config: {} as never,
      data: { title: "Something.Else", detail: "Rating rejected" },
    };
    mockIdeasApi.setRating.mockRejectedValue(error);
    renderCard(makeIdea());

    await user.click(screen.getByRole("button", { name: "Rate 2 stars" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("[400] Rating rejected");
  });

  it("wires edit, delete, and expand callbacks from the card actions", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onToggleExpand = vi.fn();
    renderCard(makeIdea({ canEdit: true, canDelete: true }), {
      onEdit,
      onDelete,
      onToggleExpand,
    });

    await user.click(screen.getByRole("button", { name: /edit/i }));
    await user.click(screen.getByRole("button", { name: /delete/i }));
    await user.click(screen.getByRole("button", { name: /open/i }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onToggleExpand).toHaveBeenCalledTimes(1);
  });

  it("hides edit and delete when the API does not grant them", () => {
    renderCard(makeIdea(), { onEdit: vi.fn(), onDelete: vi.fn() });

    expect(screen.queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
  });

  it("lets an admin change lifecycle status from the expanded card", async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    renderCard(makeIdea({ canChangeStatus: true, status: "Proposed" }), {
      expanded: true,
      onStatusChange,
    });

    await user.selectOptions(screen.getByRole("combobox"), "Planned");

    expect(onStatusChange).toHaveBeenCalledWith("Planned");
  });

  it("shows moderation notes with a rejection label on rejected ideas", () => {
    renderCard(
      makeIdea({
        moderationState: "Rejected",
        moderationNotes: "Please add detail.",
      }),
      { expanded: true, sectionStyle: "private" }
    );

    expect(screen.getByText("Rejection note")).toBeInTheDocument();
    expect(screen.getByText("Please add detail.")).toBeInTheDocument();
  });
});
