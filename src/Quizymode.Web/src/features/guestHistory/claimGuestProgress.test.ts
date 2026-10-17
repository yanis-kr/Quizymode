import { beforeEach, describe, expect, it, vi } from "vitest";
import { claimGuestProgress } from "./claimGuestProgress";

const { mockImport } = vi.hoisted(() => ({ mockImport: vi.fn() }));
const { mockTrackOnce } = vi.hoisted(() => ({ mockTrackOnce: vi.fn() }));
vi.mock("@/features/analytics/analyticsEvents", () => ({ trackEventOnce: mockTrackOnce }));
vi.mock("@/api/studySessions", () => ({ studySessionsApi: { importGuest: mockImport } }));

const { mockRead, mockClear } = vi.hoisted(() => ({ mockRead: vi.fn(), mockClear: vi.fn() }));
vi.mock("./guestHistoryStorage", () => ({ readGuestHistory: mockRead, clearGuestHistory: mockClear }));

const summary = {
  runId: "run-1",
  completedAt: "2026-10-16T00:00:00.000Z",
  correct: 2,
  total: 3,
  source: null,
  missedItemIds: [],
};

describe("claimGuestProgress", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does nothing when there is no guest history", async () => {
    mockRead.mockReturnValue([]);
    expect(await claimGuestProgress()).toEqual({ status: "none" });
    expect(mockImport).not.toHaveBeenCalled();
  });

  it("sends a versioned payload and clears guest storage after confirmation", async () => {
    mockRead.mockReturnValue([summary]);
    mockImport.mockResolvedValueOnce({ imported: 1, duplicates: 1, rejectedRunIds: ["x"] });

    const result = await claimGuestProgress();

    expect(mockImport).toHaveBeenCalledWith({ version: 1, runs: [summary] });
    expect(result).toEqual({ status: "saved", saved: 2, skipped: 1 });
    expect(mockClear).toHaveBeenCalledTimes(1);
    expect(mockTrackOnce).toHaveBeenCalledWith("imported", { name: "guest_state_imported", contextType: "auth" });
  });

  it("does not record the funnel event when nothing was saved", async () => {
    mockRead.mockReturnValue([summary]);
    mockImport.mockResolvedValueOnce({ imported: 0, duplicates: 0, rejectedRunIds: ["run-1"] });

    await claimGuestProgress();

    expect(mockTrackOnce).not.toHaveBeenCalled();
  });

  it("keeps guest storage when the import fails", async () => {
    mockRead.mockReturnValue([summary]);
    mockImport.mockRejectedValueOnce(new Error("503"));

    expect(await claimGuestProgress()).toEqual({ status: "failed", pending: 1 });
    expect(mockClear).not.toHaveBeenCalled();
    expect(mockTrackOnce).not.toHaveBeenCalled();
  });
});
