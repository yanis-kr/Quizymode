import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import LlmUsagePanel from "./LlmUsagePanel";
import { adminLlmProvidersApi, type LlmUsageResponse } from "@/api/adminLlmProviders";

vi.mock("@/api/adminLlmProviders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/adminLlmProviders")>();
  return { ...actual, adminLlmProvidersApi: { getUsage: vi.fn() } };
});

const usage: LlmUsageResponse = {
  days: 30,
  sinceUtc: "2026-09-20T00:00:00Z",
  rows: [
    {
      vendor: "Gemini",
      model: "gemini-2.5-flash-lite",
      attempts: 8,
      successes: 6,
      inputTokens: 12345,
      outputTokens: 567,
      avgDurationMs: 1250,
      estimatedCostUsd: 0.0123,
    },
    {
      vendor: "OpenAI",
      model: "gpt-5-nano",
      attempts: 3,
      successes: 0,
      inputTokens: 0,
      outputTokens: 0,
      avgDurationMs: 90,
      estimatedCostUsd: null,
    },
  ],
  topUsers: [{ userId: "11111111-2222-3333-4444-555555555555", chargedSections: 12, inputTokens: 4000, outputTokens: 900 }],
};

function renderPanel() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LlmUsagePanel />
    </QueryClientProvider>
  );
}

describe("LlmUsagePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminLlmProvidersApi.getUsage).mockResolvedValue(usage);
  });

  it("shows usage rows with success rate, tokens, duration, and n/a for unpriced models", async () => {
    renderPanel();

    const table = await screen.findByRole("table", { name: "Usage by vendor and model" });
    const rows = within(table).getAllByRole("row");
    const gemini = within(rows[1]).getAllByRole("cell").map((cell) => cell.textContent);
    expect(gemini).toEqual(["Gemini", "gemini-2.5-flash-lite", "8", "75%", "12,345 / 567", "1,250 ms", "$0.0123"]);
    const openAi = within(rows[2]).getAllByRole("cell").map((cell) => cell.textContent);
    expect(openAi).toEqual(["OpenAI", "gpt-5-nano", "3", "0%", "0 / 0", "90 ms", "n/a"]);
    expect(within(rows[2]).getByText("n/a")).toHaveAttribute("title", "No price configured for this model");
  });

  it("lists top users by user id only", async () => {
    renderPanel();

    const table = await screen.findByRole("table", { name: "Top users by charged sections" });
    const cells = within(within(table).getAllByRole("row")[1]).getAllByRole("cell").map((cell) => cell.textContent);
    expect(cells).toEqual(["11111111-2222-3333-4444-555555555555", "12", "4,000 / 900"]);
    expect(screen.getByText("Top 20 users by charged sections in this window.")).toBeInTheDocument();
  });

  it("defaults to 30 days and refetches when the window changes", async () => {
    renderPanel();
    await screen.findByRole("table", { name: "Usage by vendor and model" });

    const select = screen.getByLabelText("Usage window");
    expect(select).toHaveValue("30");
    expect(adminLlmProvidersApi.getUsage).toHaveBeenLastCalledWith(30);
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Last day",
      "Last 7 days",
      "Last 30 days",
      "Last 90 days",
    ]);

    for (const days of [1, 7, 90]) {
      fireEvent.change(select, { target: { value: String(days) } });
      await waitFor(() => expect(adminLlmProvidersApi.getUsage).toHaveBeenLastCalledWith(days));
    }
  });

  it("shows the empty state when there were no vendor calls", async () => {
    vi.mocked(adminLlmProvidersApi.getUsage).mockResolvedValue({ ...usage, rows: [], topUsers: [] });
    renderPanel();

    expect(await screen.findByText("No vendor calls in this window.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("keeps the top users heading with a message when nobody was charged", async () => {
    vi.mocked(adminLlmProvidersApi.getUsage).mockResolvedValue({ ...usage, topUsers: [] });
    renderPanel();

    expect(await screen.findByText("No charged sections in this window.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Top users" })).toBeInTheDocument();
  });

  it("shows an error with retry", async () => {
    vi.mocked(adminLlmProvidersApi.getUsage).mockRejectedValueOnce(new Error("boom"));
    renderPanel();

    expect(await screen.findByText("Failed to load usage")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(await screen.findByRole("table", { name: "Usage by vendor and model" })).toBeInTheDocument();
  });
});
