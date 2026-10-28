import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import ReviewBoardPage from "./ReviewBoardPage";
import { adminApi } from "@/api/admin";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: true, isAdmin: true }),
}));
vi.mock("@/api/admin", () => ({
  adminApi: { getReviewBoardItems: vi.fn(), approveItem: vi.fn(), rejectItem: vi.fn() },
}));

const baseItem = {
  id: "i1",
  category: "science",
  isPrivate: true,
  question: "Which animal barks?",
  correctAnswer: "Dog",
  incorrectAnswers: ["Cat"],
  explanation: "",
  createdBy: "user-1",
  createdAt: "2026-01-01T00:00:00Z",
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ReviewBoardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ReviewBoardPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the group label when an item has one (#359)", async () => {
    vi.mocked(adminApi.getReviewBoardItems).mockResolvedValue({
      items: [
        { ...baseItem, groupLabel: "Mammals" },
        { ...baseItem, id: "i2", question: "Plain?", groupLabel: null },
      ],
    });
    renderPage();

    expect(await screen.findByText("Group: Mammals")).toBeInTheDocument();
    expect(screen.getAllByText(/^Group:/)).toHaveLength(1);
  });
});
