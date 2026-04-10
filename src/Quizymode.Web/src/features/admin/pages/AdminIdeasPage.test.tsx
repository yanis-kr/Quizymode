import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
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
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/api/ideas", () => ({
  ideasApi: mockIdeasApi,
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/admin/ideas"]}>
        <Routes>
          <Route path="/admin/ideas" element={<AdminIdeasPage />} />
          <Route path="/" element={<div data-testid="home">Home</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("AdminIdeasPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIdeasApi.getAdminIdeas.mockResolvedValue({
      ideas: [
        {
          id: "idea-1",
          title: "Review pending idea",
          problem: "The queue needs a first-class moderation surface.",
          proposedChange: "Add approve and reject controls for idea submissions.",
          tradeOffs: "Admins will need concise context on each card.",
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
          canModerate: true,
        },
      ],
    });
  });

  it("renders the ideas moderation queue for admins", async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isAdmin: true });

    renderPage();

    expect(await screen.findByRole("heading", { name: /ideas moderation/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pending review/i })).toBeInTheDocument();
    expect(await screen.findByText("Review pending idea")).toBeInTheDocument();
  });

  it("shows moderation actions when a card is expanded", async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isAdmin: true });

    renderPage();

    await screen.findByText("Review pending idea");
    await user.click(screen.getByRole("button", { name: /open/i }));

    expect(screen.getByRole("button", { name: /approve and publish/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^reject$/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/moderation note/i)).toBeInTheDocument();
  });

  it("redirects non-admin users away", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isAdmin: false });

    renderPage();

    expect(screen.getByTestId("home")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /ideas moderation/i })).not.toBeInTheDocument();
  });
});
