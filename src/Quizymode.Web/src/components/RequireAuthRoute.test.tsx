import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import RequireAuthRoute from "./RequireAuthRoute";

const mockUseAuth = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderRoutes(options?: { requireAdmin?: boolean; initialEntry?: string }) {
  return render(
    <MemoryRouter initialEntries={[options?.initialEntry ?? "/items/add"]}>
      <Routes>
        <Route
          element={<RequireAuthRoute requireAdmin={options?.requireAdmin} />}
        >
          <Route path="/items/add" element={<div>Protected page</div>} />
          <Route path="/admin" element={<div>Admin page</div>} />
        </Route>
        <Route path="/" element={<LocationDisplay />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("RequireAuthRoute", () => {
  it("shows a loading spinner while auth state is bootstrapping", () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isAdmin: false,
      isLoading: true,
    });

    renderRoutes();

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("redirects unauthenticated users to the home page", async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isAdmin: false,
      isLoading: false,
    });

    renderRoutes();

    expect(await screen.findByTestId("location")).toHaveTextContent("/");
  });

  it("redirects non-admin users away from admin routes", async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isAdmin: false,
      isLoading: false,
    });

    renderRoutes({ requireAdmin: true, initialEntry: "/admin" });

    expect(await screen.findByTestId("location")).toHaveTextContent("/");
  });

  it("renders the protected route when access is allowed", async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isAdmin: true,
      isLoading: false,
    });

    renderRoutes({ requireAdmin: true, initialEntry: "/admin" });

    expect(await screen.findByText("Admin page")).toBeInTheDocument();
  });
});
