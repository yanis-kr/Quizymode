import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import IdeasPage from "./IdeasPage";

const { mockUseAuth, mockIdeasApi } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockIdeasApi: {
    getBoard: vi.fn(),
    getMine: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
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
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <IdeasPage />
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

describe("IdeasPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIdeasApi.getBoard.mockResolvedValue({
      ideas: [
        {
          id: "idea-1",
          title: "Improve study sessions",
          problem: "Learners lose context between study sessions.",
          proposedChange: "Add resumable sessions with a quick continue action.",
          tradeOffs: "Needs lightweight persistence and session cleanup.",
          status: "Planned",
          moderationState: "Published",
          moderationNotes: null,
          authorName: "Quizymode",
          reviewedByName: "Admin",
          createdAt: "2026-04-01T10:00:00Z",
          updatedAt: "2026-04-02T10:00:00Z",
          reviewedAt: "2026-04-02T11:00:00Z",
          commentCount: 2,
          ratingCount: 3,
          averageStars: 4.5,
          myRating: null,
          canEdit: false,
          canDelete: false,
          canChangeStatus: false,
          canModerate: false,
        },
      ],
    });
    mockIdeasApi.getMine.mockResolvedValue({ ideas: [] });
  });

  it("shows the public board and sign-in prompt for anonymous users", async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isAdmin: false,
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: /public board/i })).toBeInTheDocument();
    expect(await screen.findByText("Improve study sessions")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute(
      "href",
      "/login"
    );
    expect(screen.queryByRole("heading", { name: /my submissions/i })).not.toBeInTheDocument();
  });

  it("shows private submissions and share action for authenticated users", async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isAdmin: false,
    });
    mockIdeasApi.getMine.mockResolvedValue({
      ideas: [
        {
          id: "mine-1",
          title: "Pending queue cleanup",
          problem: "Moderation feedback is hard to track.",
          proposedChange: "Show moderation notes inside a private submissions area.",
          tradeOffs: null,
          status: "Proposed",
          moderationState: "PendingReview",
          moderationNotes: "Waiting for review.",
          authorName: "Me",
          reviewedByName: null,
          createdAt: "2026-04-03T10:00:00Z",
          updatedAt: null,
          reviewedAt: null,
          commentCount: 0,
          ratingCount: 0,
          averageStars: null,
          myRating: null,
          canEdit: true,
          canDelete: true,
          canChangeStatus: false,
          canModerate: false,
        },
      ],
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: /my submissions/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /share an idea/i })).toBeInTheDocument();
    expect(await screen.findByText("Pending queue cleanup")).toBeInTheDocument();
  });
});
