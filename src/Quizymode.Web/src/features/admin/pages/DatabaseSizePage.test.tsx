import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import DatabaseSizePage from "./DatabaseSizePage";

const { mockUseAuth, mockAdminApi } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockAdminApi: {
    getDatabaseSize: vi.fn(),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/api/admin", () => ({
  adminApi: mockAdminApi,
}));

vi.mock("@/components/LoadingSpinner", () => ({ default: () => <div>Loading...</div> }));
vi.mock("@/components/ErrorMessage", () => ({
  default: ({ message }: { message: string }) => <div>{message}</div>,
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
      <MemoryRouter initialEntries={["/admin/database-size"]}>
        <Routes>
          <Route path="/admin/database-size" element={<DatabaseSizePage />} />
          <Route path="/" element={<div data-testid="home">Home</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("DatabaseSizePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminApi.getDatabaseSize.mockResolvedValue({
      sizeBytes: 104857600,
      sizeMegabytes: 100,
      sizeGigabytes: 0.0977,
      freeTierLimitMegabytes: 500,
      usagePercentage: 20,
      itemCount: 1234,
      keywordCount: 567,
      topTables: [
        {
          tableName: "Items",
          sizeBytes: 52428800,
          sizeMegabytes: 50,
          sizeGigabytes: 0.0488,
        },
        {
          tableName: "Keywords",
          sizeBytes: 10485760,
          sizeMegabytes: 10,
          sizeGigabytes: 0.0098,
        },
      ],
    });
  });

  it("renders database totals and top table sizes for admins", async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isAdmin: true });

    renderPage();

    expect(await screen.findByRole("heading", { name: /database size/i })).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
    expect(screen.getByText("567")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /top 5 largest tables/i })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Items" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Keywords" })).toBeInTheDocument();
    expect(screen.getByText("50 MB")).toBeInTheDocument();
  });

  it("redirects non-admin users away", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isAdmin: false });

    renderPage();

    expect(screen.getByTestId("home")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /database size/i })).not.toBeInTheDocument();
  });
});
