import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import FunnelTab from "./FunnelTab";

const { mockGetConversionFunnel } = vi.hoisted(() => ({ mockGetConversionFunnel: vi.fn() }));

vi.mock("@/api/admin", () => ({
  adminApi: { getConversionFunnel: mockGetConversionFunnel },
}));

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <FunnelTab days={30} includeBots={false} />
    </QueryClientProvider>
  );
}

describe("FunnelTab", () => {
  beforeEach(() => {
    mockGetConversionFunnel.mockReset();
  });

  it("lists each step with unique sessions and conversion rates", async () => {
    mockGetConversionFunnel.mockResolvedValue({
      windowStartUtc: "2026-10-01T00:00:00Z",
      windowEndUtc: "2026-10-14T00:00:00Z",
      sessionsWithEvents: 4,
      botSessions: 2,
      botsExcluded: true,
      steps: [
        { eventName: "quick_quiz_started", sessions: 4, events: 5, conversionFromPreviousPercent: null, conversionFromFirstPercent: null },
        { eventName: "quiz_completed", sessions: 2, events: 2, conversionFromPreviousPercent: 50, conversionFromFirstPercent: 50 },
      ],
    });

    renderTab();

    const completedRow = (await screen.findByText("Quiz completed")).closest("tr") as HTMLTableRowElement;
    expect(within(completedRow).getByText("2")).toBeInTheDocument();
    expect(within(completedRow).getAllByText("50%")).toHaveLength(2);

    const startedRow = screen.getByText("Quick quiz started").closest("tr") as HTMLTableRowElement;
    expect(within(startedRow).getAllByText("—")).toHaveLength(2);
    expect(screen.getByText(/2 bot sessions were excluded/)).toBeInTheDocument();
    expect(mockGetConversionFunnel).toHaveBeenCalledWith(30, false);
  });

  it("shows an error state when the report fails", async () => {
    mockGetConversionFunnel.mockRejectedValue(new Error("boom"));

    renderTab();

    expect(await screen.findByText("Failed to load the conversion funnel")).toBeInTheDocument();
  });
});
