import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AdminFeedbackPage from "./AdminFeedbackPage";

const { mockUseAuth, mockAdminApi } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockAdminApi: {
    getAdminFeedback: vi.fn(),
    updateFeedbackStatus: vi.fn(),
    getPageViewSessionDetail: vi.fn(),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mockUseAuth() }));
vi.mock("@/api/admin", () => ({ adminApi: mockAdminApi }));
vi.mock("@/components/LoadingSpinner", () => ({ default: () => <div>Loading...</div> }));
vi.mock("@/components/ErrorMessage", () => ({
  default: ({ message }: { message: string }) => <div>{message}</div>,
}));

const item = {
  id: "f1",
  type: "reportIssue",
  status: "New",
  details: "The quiz button is broken",
  pageUrl: "https://www.quizymode.com/quiz",
  additionalKeywords: null,
  userEmail: "member@example.com",
  contactEmail: "contact@example.com",
  userAgent: "Mozilla/5.0",
  sessionId: "sess-1",
  createdAt: "2026-10-15T10:00:00Z",
};

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/admin/feedback"]}>
        <Routes>
          <Route path="/admin/feedback" element={<AdminFeedbackPage />} />
          <Route path="/" element={<div data-testid="home">Home</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("AdminFeedbackPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isAdmin: true });
    mockAdminApi.getAdminFeedback.mockResolvedValue({
      items: [item],
      totalCount: 1,
      page: 1,
      pageSize: 20,
      newCount: 1,
    });
    mockAdminApi.updateFeedbackStatus.mockResolvedValue({ ...item, status: "Reviewed" });
    mockAdminApi.getPageViewSessionDetail.mockResolvedValue({
      steps: [{ stepNumber: 1, path: "/quiz", createdUtc: "2026-10-15T09:59:00Z" }],
    });
  });

  it("redirects non-admins home", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isAdmin: false });
    renderPage();
    expect(screen.getByTestId("home")).toBeInTheDocument();
  });

  it("lists submissions with contact details and defaults to New", async () => {
    renderPage();

    expect(await screen.findByText("The quiz button is broken")).toBeInTheDocument();
    expect(screen.getByText(/member@example.com \/ contact@example.com/)).toBeInTheDocument();
    expect(mockAdminApi.getAdminFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ status: "New", page: 1 })
    );
  });

  it("filters by type and refetches", async () => {
    renderPage();
    await screen.findByText("The quiz button is broken");

    await userEvent.selectOptions(screen.getByLabelText("Type"), "requestItems");

    await waitFor(() =>
      expect(mockAdminApi.getAdminFeedback).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: "requestItems" })
      )
    );
  });

  it("changes status and loads the session journey", async () => {
    renderPage();
    await screen.findByText("The quiz button is broken");

    await userEvent.click(screen.getByRole("button", { name: "Mark reviewed" }));
    await waitFor(() => expect(mockAdminApi.updateFeedbackStatus).toHaveBeenCalledWith("f1", "Reviewed"));

    await userEvent.click(screen.getByRole("button", { name: /show session journey/i }));
    expect(await screen.findByText("/quiz")).toBeInTheDocument();
    expect(mockAdminApi.getPageViewSessionDetail).toHaveBeenCalledWith("sess-1", true);
  });

  it("shows an empty state", async () => {
    mockAdminApi.getAdminFeedback.mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 20, newCount: 0 });
    renderPage();
    expect(await screen.findByText(/no feedback matches/i)).toBeInTheDocument();
  });

  it("shows an error state", async () => {
    mockAdminApi.getAdminFeedback.mockRejectedValue(new Error("boom"));
    renderPage();
    expect(await screen.findByText(/failed to load feedback/i)).toBeInTheDocument();
  });
});
