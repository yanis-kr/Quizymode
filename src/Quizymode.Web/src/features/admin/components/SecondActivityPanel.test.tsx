import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { SecondActivityResponse } from "@/api/admin";
import SecondActivityPanel from "./SecondActivityPanel";

const getSecondActivity = vi.fn();

vi.mock("@/api/admin", () => ({
  adminApi: { getSecondActivity: (...args: unknown[]) => getSecondActivity(...args) },
}));

const response = (overrides: Partial<SecondActivityResponse>): SecondActivityResponse => ({
  windowStartUtc: "2026-11-01T00:00:00Z",
  windowEndUtc: "2026-11-15T00:00:00Z",
  botsExcluded: true,
  internalExcluded: true,
  qualifyingSessions: 3,
  secondStartedSessions: 3,
  secondStartedPercent: null,
  second: { sameScope: 1, otherTopic: 1, sameTopicDifferentScope: 0, unknown: 1 },
  medianSecondsToFirstAnswer: 42,
  ratesSuppressed: true,
  note: "Too few sessions for rates.",
  byEntryArea: [],
  ...overrides,
});

const renderPanel = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SecondActivityPanel days={14} includeBots={false} />
    </QueryClientProvider>
  );
};

describe("SecondActivityPanel", () => {
  it("shows counts only and the small-sample note under 20 qualifying sessions", async () => {
    getSecondActivity.mockResolvedValue(response({}));

    renderPanel();

    expect(await screen.findByText("Too few sessions for rates.")).toBeInTheDocument();
    expect(screen.queryByText(/%\)/)).toBeNull();
    expect(getSecondActivity).toHaveBeenCalledWith(14, false, false);
  });

  it("shows the rate when the sample is large enough", async () => {
    getSecondActivity.mockResolvedValue(
      response({ qualifyingSessions: 25, secondStartedSessions: 10, secondStartedPercent: 40, ratesSuppressed: false, note: null })
    );

    renderPanel();

    expect(await screen.findByText(/\(40%\)/)).toBeInTheDocument();
    expect(screen.queryByText("Too few sessions for rates.")).toBeNull();
  });
});
