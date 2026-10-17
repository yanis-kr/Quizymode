import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TrendsTab from "./TrendsTab";

const { mockAdminApi } = vi.hoisted(() => ({
  mockAdminApi: { getPageViewRollups: vi.fn() },
}));

vi.mock("@/api/admin", () => ({ adminApi: mockAdminApi }));
vi.mock("@/components/LoadingSpinner", () => ({ default: () => <div>Loading...</div> }));
vi.mock("@/components/ErrorMessage", () => ({
  default: ({ message }: { message: string }) => <div>{message}</div>,
}));

const response = {
  windowStartDay: "2025-10-16",
  windowEndDay: "2026-10-15",
  retentionDays: 180,
  latestRolledDay: "2026-10-15",
  totalHits: 120,
  totalSessionDays: 42,
  totalBouncedSessionDays: 10,
  totalItemSteps: 55,
  daily: [
    { day: "2026-10-14", sessions: 20, hits: 60, itemSteps: 30 },
    { day: "2026-10-15", sessions: 22, hits: 60, itemSteps: 25 },
  ],
  areas: [{ area: "quiz", hits: 80, sessionDays: 30, itemSteps: 55 }],
  channels: [{ value: "search", sessionDays: 25, hits: 70 }],
  deviceClasses: [{ value: "mobile", sessionDays: 30, hits: 90 }],
  outcomes: [{ value: "anonymous", sessionDays: 40, hits: 110 }],
  visitorTypes: [{ value: "returning", sessionDays: 12, hits: 50 }],
  topScopes: [],
};

function renderTab() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TrendsTab />
    </QueryClientProvider>
  );
}

describe("TrendsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminApi.getPageViewRollups.mockResolvedValue(response);
  });

  it("loads a year of rollups by default and shows totals, areas, and dimensions", async () => {
    renderTab();

    expect(await screen.findByText("42")).toBeInTheDocument();
    expect(mockAdminApi.getPageViewRollups).toHaveBeenCalledWith(365);
    expect(screen.getByText(/raw hits are kept 180 days/)).toBeInTheDocument();
    expect(screen.getByText("Quiz")).toBeInTheDocument();
    expect(screen.getByText("search")).toBeInTheDocument();
    expect(screen.getByText("returning")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Daily sessions chart" })).toBeInTheDocument();
  });

  it("switches to a two-year range", async () => {
    renderTab();
    await screen.findByText("42");

    await userEvent.click(screen.getByRole("button", { name: "2y" }));

    await waitFor(() => expect(mockAdminApi.getPageViewRollups).toHaveBeenCalledWith(730));
  });
});
