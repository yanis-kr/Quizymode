import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AdminClientErrorsPage from "./AdminClientErrorsPage";

const { mockUseAuth, mockAdminApi } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockAdminApi: {
    getClientErrors: vi.fn(),
    getPageViewSessionDetail: vi.fn(),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mockUseAuth() }));
vi.mock("@/api/admin", () => ({ adminApi: mockAdminApi }));
vi.mock("@/components/LoadingSpinner", () => ({ default: () => <div>Loading...</div> }));
vi.mock("@/components/ErrorMessage", () => ({
  default: ({ message }: { message: string }) => <div>{message}</div>,
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/admin/client-errors"]}>
        <Routes>
          <Route path="/admin/client-errors" element={<AdminClientErrorsPage />} />
          <Route path="/" element={<div data-testid="home">Home</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const response = {
  windowStartUtc: "2026-10-09T00:00:00Z",
  windowEndUtc: "2026-10-16T00:00:00Z",
  totalReports: 4,
  totalGroups: 1,
  newGroups: 1,
  botReports: 2,
  botsExcluded: true,
  internalSessions: 1,
  internalExcluded: true,
  truncated: false,
  appVersions: ["3.58.0", "3.57.1"],
  groups: [
    {
      fingerprint: "0123456789abcdef0123456789abcdef",
      errorName: "TypeError",
      message: "Cannot read properties of undefined (reading 'map')",
      source: "boundary",
      count: 4,
      sessions: 3,
      firstSeenUtc: "2026-10-15T10:00:00Z",
      lastSeenUtc: "2026-10-16T09:00:00Z",
      isNew: true,
      latestAppVersion: "3.58.0",
      topPaths: [{ value: "/categories", count: 3 }],
      browsers: [{ value: "Chrome", count: 4 }],
      devices: [{ value: "desktop", count: 3 }, { value: "mobile", count: 1 }],
      sampleStack: "TypeError: boom\n    at CategoryList",
      sampleComponentStack: "\n    at CategoryList",
      sampleSessionId: "session-9",
    },
  ],
};

describe("AdminClientErrorsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isAdmin: true });
    mockAdminApi.getClientErrors.mockResolvedValue(response);
    mockAdminApi.getPageViewSessionDetail.mockResolvedValue({
      sessionId: "session-9",
      steps: [{ stepNumber: 1, path: "/categories", createdUtc: "2026-10-16T08:59:00Z" }],
    });
  });

  it("redirects non-admins home", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isAdmin: false });
    renderPage();
    expect(screen.getByTestId("home")).toBeInTheDocument();
    expect(mockAdminApi.getClientErrors).not.toHaveBeenCalled();
  });

  it("shows grouped errors excluding bots and internal traffic by default", async () => {
    renderPage();

    expect(await screen.findByText("TypeError: Cannot read properties of undefined (reading 'map')")).toBeInTheDocument();
    expect(mockAdminApi.getClientErrors).toHaveBeenCalledWith(7, "", false, false);
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.getByText("Render")).toBeInTheDocument();
    expect(screen.getByText("/categories (3)")).toBeInTheDocument();
    expect(screen.getByText("desktop (3), mobile (1)")).toBeInTheDocument();
    expect(screen.getByText(/2 bot report\(s\) excluded/)).toBeInTheDocument();
    expect(screen.getByText(/1 internal session\(s\) excluded/)).toBeInTheDocument();
  });

  it("filters by app version, window, bots and internal traffic", async () => {
    renderPage();
    await screen.findByText("3.58.0", { selector: "option" });

    fireEvent.change(screen.getByLabelText("App version"), { target: { value: "3.58.0" } });
    fireEvent.change(screen.getByLabelText("Time window"), { target: { value: "30" } });
    fireEvent.click(screen.getByLabelText("Include bots"));
    fireEvent.click(screen.getByLabelText("Include internal traffic"));

    await waitFor(() => expect(mockAdminApi.getClientErrors).toHaveBeenLastCalledWith(30, "3.58.0", true, true));
  });

  it("loads the sample session journey on demand", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Show sample session journey" }));

    await waitFor(() => expect(mockAdminApi.getPageViewSessionDetail).toHaveBeenCalledWith("session-9", false));
    expect(await screen.findByText("/categories", { selector: "span" })).toBeInTheDocument();
  });
});
