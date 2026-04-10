import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import AdminDashboardPage from "./AdminDashboardPage";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseAuth = vi.fn();

function renderPage(initialEntry = "/admin") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/admin" element={<AdminDashboardPage />} />
        <Route path="/" element={<div data-testid="home">Home</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("AdminDashboardPage", () => {
  it("renders admin tools for admin users", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isAdmin: true });
    renderPage();

    expect(screen.getByRole("heading", { name: /admin dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /review board/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /database size/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /audit logs/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /manage keywords/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /seed sync/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /usage analytics/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ideas moderation/i })).toBeInTheDocument();
  });

  it("redirects non-admin users to home", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isAdmin: false });
    renderPage();

    expect(screen.queryByRole("heading", { name: /admin dashboard/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("home")).toBeInTheDocument();
  });

  it("redirects unauthenticated users to home", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isAdmin: false });
    renderPage();

    expect(screen.queryByRole("heading", { name: /admin dashboard/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("home")).toBeInTheDocument();
  });

  it("renders review-board link with correct href", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isAdmin: true });
    renderPage();

    expect(screen.getByRole("link", { name: /review board/i })).toHaveAttribute(
      "href",
      "/admin/review-board"
    );
  });

  it("renders users & activity link", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isAdmin: true });
    renderPage();

    expect(screen.getByRole("link", { name: /users.*activity/i })).toHaveAttribute(
      "href",
      "/admin/user-settings"
    );
  });

  it("renders ideas moderation link with correct href", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isAdmin: true });
    renderPage();

    expect(screen.getByRole("link", { name: /ideas moderation/i })).toHaveAttribute(
      "href",
      "/admin/ideas"
    );
  });
});
