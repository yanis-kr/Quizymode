import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import Layout from "./Layout";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: false,
    logout: vi.fn(),
    username: null,
    email: null,
    isAdmin: false,
  }),
}));

vi.mock("@/api/users", () => ({
  usersApi: {
    getCurrent: vi.fn(),
  },
}));

vi.mock("./UserProfileModal", () => ({
  default: () => null,
}));

vi.mock("@/features/feedback/components/FeedbackDialog", () => ({
  default: () => null,
}));

function renderLayout() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Layout>
          <div>Page content</div>
        </Layout>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Layout", () => {
  const originalUserAgent = window.navigator.userAgent;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: originalUserAgent,
    });
  });

  it("links to the desktop user guide for desktop browsers", () => {
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/135.0.0.0 Safari/537.36",
    });

    renderLayout();

    expect(screen.getByRole("link", { name: "User Guide" })).toHaveAttribute(
      "href",
      "https://github.com/yanis-kr/Quizymode/blob/main/docs/user-guide/user-guide.md"
    );
  });

  it("links to the mobile user guide for mobile browsers", () => {
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    });

    renderLayout();

    expect(screen.getByRole("link", { name: "User Guide" })).toHaveAttribute(
      "href",
      "https://github.com/yanis-kr/Quizymode/blob/main/docs/user-guide/user-guide.mobile.md"
    );
  });

  it("shows the ideas footer link instead of the old map action", () => {
    renderLayout();

    expect(screen.getByRole("link", { name: "Ideas" })).toHaveAttribute(
      "href",
      "/ideas"
    );
    expect(screen.queryByRole("button", { name: "Map" })).not.toBeInTheDocument();
  });
});
