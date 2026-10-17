import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { IdeaSummaryResponse } from "@/api/ideas";
import AdminIdeasPage from "./AdminIdeasPage";

const { mockUseAuth, mockIdeasApi } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockIdeasApi: {
    getAdminIdeas: vi.fn(),
    update: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    delete: vi.fn(),
    updateStatus: vi.fn(),
    setRating: vi.fn(),
    getComments: vi.fn(),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/api/ideas", () => ({
  ideasApi: mockIdeasApi,
}));

vi.mock("@/features/ideas/components/TurnstileWidget", () => ({
  default: () => null,
}));

function makeIdea(overrides: Partial<IdeaSummaryResponse> = {}): IdeaSummaryResponse {
  return {
    id: "idea-1",
    title: "Review pending idea",
    problem: "The queue needs a first-class moderation surface.",
    proposedChange: "Add approve and reject controls for idea submissions.",
    tradeOffs: null,
    status: "Proposed",
    moderationState: "PendingReview",
    moderationNotes: null,
    authorName: "User",
    reviewedByName: null,
    createdAt: "2026-04-02T10:00:00Z",
    updatedAt: null,
    reviewedAt: null,
    commentCount: 0,
    ratingCount: 0,
    averageStars: null,
    myRating: null,
    canEdit: true,
    canDelete: true,
    canChangeStatus: true,
    ...overrides,
  };
}

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

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/admin/ideas"]}>
        <Routes>
          <Route path="/admin/ideas" element={<AdminIdeasPage />} />
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function openFirstCard(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText("Review pending idea");
  await user.click(screen.getByRole("button", { name: /^open$/i }));
}

describe("AdminIdeasPage moderation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isAdmin: true });
    mockIdeasApi.getAdminIdeas.mockResolvedValue({ ideas: [makeIdea()] });
    mockIdeasApi.approve.mockResolvedValue(makeIdea({ moderationState: "Published" }));
    mockIdeasApi.reject.mockResolvedValue(makeIdea({ moderationState: "Rejected" }));
    mockIdeasApi.delete.mockResolvedValue(undefined);
    mockIdeasApi.updateStatus.mockResolvedValue(makeIdea());
    mockIdeasApi.getComments.mockResolvedValue({ comments: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("approves a pending idea", async () => {
    const user = userEvent.setup();
    renderPage();

    await openFirstCard(user);
    await user.click(screen.getByRole("button", { name: /approve and publish/i }));

    await waitFor(() => expect(mockIdeasApi.approve).toHaveBeenCalledTimes(1));
    expect(mockIdeasApi.approve.mock.calls[0][0]).toBe("idea-1");
  });

  it("requires a note before rejecting and sends the trimmed note", async () => {
    const user = userEvent.setup();
    renderPage();

    await openFirstCard(user);
    const rejectButton = screen.getByRole("button", { name: /^reject$/i });
    expect(rejectButton).toBeDisabled();

    await user.type(screen.getByLabelText(/moderation note/i), "  Too vague to act on  ");
    expect(rejectButton).toBeEnabled();
    await user.click(rejectButton);

    await waitFor(() =>
      expect(mockIdeasApi.reject).toHaveBeenCalledWith("idea-1", {
        moderationNotes: "Too vague to act on",
      })
    );
  });

  it("deletes an idea after confirmation and skips it when dismissed", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    renderPage();

    await screen.findByText("Review pending idea");
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(mockIdeasApi.delete).not.toHaveBeenCalled();

    confirm.mockReturnValueOnce(true);
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    await waitFor(() => expect(mockIdeasApi.delete).toHaveBeenCalledWith("idea-1"));
  });

  it("updates lifecycle status from the card", async () => {
    const user = userEvent.setup();
    mockIdeasApi.getAdminIdeas.mockResolvedValue({
      ideas: [makeIdea({ moderationState: "Published" })],
    });
    renderPage();

    await openFirstCard(user);
    await user.selectOptions(screen.getByRole("combobox"), "Planned");

    await waitFor(() =>
      expect(mockIdeasApi.updateStatus).toHaveBeenCalledWith("idea-1", {
        status: "Planned",
      })
    );
  });

  it("surfaces moderation action failures in a banner", async () => {
    const user = userEvent.setup();
    mockIdeasApi.approve.mockRejectedValue(
      apiError(500, "AdminIdeas.ApproveFailed", "Approve blew up")
    );
    renderPage();

    await openFirstCard(user);
    await user.click(screen.getByRole("button", { name: /approve and publish/i }));

    expect(await screen.findByText("Idea moderation action failed")).toBeInTheDocument();
    expect(screen.getByText("[500] Approve blew up")).toBeInTheDocument();
  });

  it("renders an error state when the moderation queue fails to load", async () => {
    mockIdeasApi.getAdminIdeas.mockRejectedValue(
      apiError(500, "AdminIdeas.ListFailed", "Queue unavailable")
    );
    renderPage();

    expect(
      await screen.findByText("Failed to load ideas moderation queue")
    ).toBeInTheDocument();
    expect(screen.getByText("[500] Queue unavailable")).toBeInTheDocument();
  });

  it("filters the queue by search text and shows the empty state", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Review pending idea");
    await user.type(
      screen.getByPlaceholderText(/search title, problem, change, or notes/i),
      "nothing matches this"
    );

    expect(
      screen.getByText("No ideas match this moderation filter right now.")
    ).toBeInTheDocument();
  });

  it("requests the matching moderation state when switching tabs", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Review pending idea");
    await user.click(screen.getByRole("button", { name: /^rejected$/i }));

    await waitFor(() =>
      expect(mockIdeasApi.getAdminIdeas.mock.calls.at(-1)?.[0]).toBe("Rejected")
    );
  });
});
