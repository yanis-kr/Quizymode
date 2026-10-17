import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AcquisitionTab from "./AcquisitionTab";

const { mockAdminApi } = vi.hoisted(() => ({
  mockAdminApi: {
    getAcquisitionReport: vi.fn(),
  },
}));

vi.mock("@/api/admin", () => ({
  adminApi: mockAdminApi,
}));

vi.mock("@/components/LoadingSpinner", () => ({
  default: () => <div>Loading...</div>,
}));
vi.mock("@/components/ErrorMessage", () => ({
  default: ({ message }: { message: string }) => <div>{message}</div>,
}));

const response = {
  windowStartUtc: "2026-10-09T00:00:00Z",
  windowEndUtc: "2026-10-16T00:00:00Z",
  totalSessions: 12,
  botSessions: 3,
  botsExcluded: true,
  internalSessions: 1,
  internalExcluded: true,
  channels: [
    {
      channel: "paid",
      sessions: 8,
      bounceRatePercent: 40,
      engagedRatePercent: 37.5,
      convertedCount: 2,
      conversionRatePercent: 25,
      sourceBreakdown: [
        {
          utmSource: "reddit",
          utmCampaign: "launch",
          sessions: 8,
          bounceRatePercent: 40,
          engagedRatePercent: 37.5,
          convertedCount: 2,
          conversionRatePercent: 25,
        },
      ],
    },
    {
      channel: "direct",
      sessions: 4,
      bounceRatePercent: 75,
      engagedRatePercent: 25,
      convertedCount: 0,
      conversionRatePercent: 0,
      sourceBreakdown: [],
    },
  ],
  deviceBreakdown: [
    { deviceClass: "mobile", sessions: 9 },
    { deviceClass: "desktop", sessions: 3 },
  ],
  countryBreakdown: [
    { country: "US", sessions: 10 },
    { country: null, sessions: 2 },
  ],
  visitors: {
    newVisitorSessions: 9,
    returningVisitorSessions: 2,
    unidentifiedSessions: 1,
    newVisitors: 9,
    returningVisitors: 2,
    returnWithin7Days: [
      {
        channel: "paid",
        utmCampaign: "launch",
        firstTimeVisitors: 6,
        returnedWithin7Days: 3,
        returnRatePercent: 50,
      },
    ],
    signupsWithVisitorHistory: 1,
    avgPreSignupSessions: 2,
    medianPreSignupSessions: 2,
    avgDaysToSignup: 2,
    medianDaysToSignup: 2,
  },
};

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AcquisitionTab days={7} includeBots={false} />
    </QueryClientProvider>
  );
}

describe("AcquisitionTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminApi.getAcquisitionReport.mockResolvedValue(response);
  });

  it("shows channels and expands a channel into source and campaign", async () => {
    const user = userEvent.setup();
    renderTab();

    const paidToggle = await screen.findByRole("button", { name: /paid/i });
    expect(screen.queryByText(/reddit/)).not.toBeInTheDocument();

    await user.click(paidToggle);

    expect(paidToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/reddit/, { selector: "td" })).toHaveTextContent("reddit / launch");
  });

  it("shows device and country breakdowns and the returning-visitor panel", async () => {
    renderTab();

    expect(await screen.findByText("By Device")).toBeInTheDocument();
    expect(screen.getByText("Unknown", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("New vs Returning Visitors")).toBeInTheDocument();
    expect(screen.getByText("First-time visitors who returned within 7 days")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("passes device and country filters to the API", async () => {
    const user = userEvent.setup();
    renderTab();

    await screen.findByText("By Device");
    await user.selectOptions(screen.getByLabelText("Device"), "mobile");
    await user.selectOptions(screen.getByLabelText("Country"), "US");

    await waitFor(() =>
      expect(mockAdminApi.getAcquisitionReport).toHaveBeenLastCalledWith(7, false, false, "mobile", "US")
    );
  });
});
