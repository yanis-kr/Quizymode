import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminOverviewPanel from "./AdminOverviewPanel";
import { formatChange } from "./overviewFormatting";

const { mockAdminApi } = vi.hoisted(() => ({
  mockAdminApi: { getAnalyticsOverview: vi.fn() },
}));

vi.mock("@/api/admin", () => ({ adminApi: mockAdminApi }));
vi.mock("@/components/LoadingSpinner", () => ({ default: () => <div>Loading...</div> }));
vi.mock("@/components/ErrorMessage", () => ({
  default: ({ message }: { message: string }) => <div>{message}</div>,
}));

const kpis = {
  humanSessions: 30,
  engagedSessions: 12,
  studySessions: 8,
  convertedSessions: 2,
  newSignups: 3,
  activeRegisteredUsers: 5,
  newVisitors: 20,
  returningVisitors: null,
};

const populated = {
  days: 7,
  windowStartDay: "2026-10-10",
  windowEndDay: "2026-10-16",
  current: kpis,
  previous: { ...kpis, humanSessions: 20, newSignups: 0, studySessions: 0 },
  daily: ["10", "11", "12"].map((d, i) => ({
    day: `2026-10-${d}`,
    humanSessions: i * 5,
    engagedSessions: i,
    studySessions: i,
    convertedSessions: 0,
    newSignups: 0,
    activeRegisteredUsers: 0,
  })),
  releaseMarkers: [{ version: "3.64.0", day: "2026-10-11" }],
  workQueue: { itemsAwaitingReview: 4, pendingPrivateKeywords: 2, ideasAwaitingModeration: 1 },
};

function renderPanel() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AdminOverviewPanel />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("formatChange", () => {
  it("shows 'new' instead of an infinite percentage when the previous window is zero", () => {
    expect(formatChange(5, 0)).toBe("new");
    expect(formatChange(0, 0)).toBeNull();
    expect(formatChange(15, 10)).toBe("+50%");
    expect(formatChange(5, 10)).toBe("-50%");
  });
});

describe("AdminOverviewPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminApi.getAnalyticsOverview.mockResolvedValue(populated);
  });

  it("shows a loading state first", () => {
    mockAdminApi.getAnalyticsOverview.mockReturnValue(new Promise(() => {}));
    renderPanel();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders KPI cards with change, release markers, and work queue links", async () => {
    renderPanel();

    const sessions = await screen.findByTestId("kpi-humanSessions");
    expect(sessions).toHaveTextContent("30");
    expect(sessions).toHaveTextContent("+50% vs previous 7d");
    expect(screen.getByTestId("kpi-newSignups")).toHaveTextContent("new vs previous 7d");
    expect(screen.getByTestId("kpi-returningVisitors")).toHaveTextContent("—");
    expect(screen.getAllByTestId("release-marker")).toHaveLength(1);
    expect(screen.getByText("v3.64.0")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /items awaiting review/i })).toHaveAttribute("href", "/admin/review-board");
    expect(screen.getByRole("link", { name: /pending private keywords/i })).toHaveAttribute("href", "/admin/keyword-review");
    expect(screen.getByRole("link", { name: /ideas awaiting moderation/i })).toHaveAttribute("href", "/admin/ideas");
  });

  it("shows an empty state when there is no traffic", async () => {
    mockAdminApi.getAnalyticsOverview.mockResolvedValue({
      ...populated,
      current: { ...kpis, humanSessions: 0 },
      previous: { ...kpis, humanSessions: 0 },
      releaseMarkers: [],
    });
    renderPanel();
    expect(await screen.findByText(/no traffic recorded/i)).toBeInTheDocument();
  });

  it("shows an error and reloads when the range changes", async () => {
    mockAdminApi.getAnalyticsOverview.mockRejectedValueOnce(new Error("boom"));
    renderPanel();
    expect(await screen.findByText(/failed to load the analytics overview/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "30d" }));
    await waitFor(() => expect(mockAdminApi.getAnalyticsOverview).toHaveBeenCalledWith(30));
  });
});
