import { beforeEach, describe, expect, it, vi } from "vitest";
import { studySessionsApi } from "./studySessions";

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }));

vi.mock("./client", () => ({ apiClient: { get: mockGet, post: mockPost } }));

describe("studySessionsApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("posts a completed run to /study-sessions", async () => {
    const request = {
      runId: "run-1",
      completedAt: "2026-10-16T00:00:00.000Z",
      correct: 3,
      total: 4,
      source: null,
      missedItemIds: [],
    };
    mockPost.mockResolvedValueOnce({ data: { session: { ...request, id: "s", origin: "quiz" }, created: true } });

    const result = await studySessionsApi.record(request);

    expect(mockPost).toHaveBeenCalledWith("/study-sessions", request);
    expect(result.created).toBe(true);
  });

  it("lists sessions and unwraps the envelope", async () => {
    mockGet.mockResolvedValueOnce({ data: { sessions: [{ id: "s" }] } });
    expect(await studySessionsApi.list(5)).toEqual([{ id: "s" }]);
    expect(mockGet).toHaveBeenCalledWith("/study-sessions", { params: { limit: 5 } });
  });

  it("gets the summary", async () => {
    mockGet.mockResolvedValueOnce({ data: { totalSessions: 2 } });
    expect(await studySessionsApi.getSummary()).toEqual({ totalSessions: 2 });
    expect(mockGet).toHaveBeenCalledWith("/study-sessions/summary");
  });
});
