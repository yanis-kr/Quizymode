import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyticsApi } from "./analytics";

const { mockPost } = vi.hoisted(() => ({ mockPost: vi.fn() }));

vi.mock("./client", () => ({
  apiClient: { post: mockPost },
}));

describe("analyticsApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("trackPageView calls POST /analytics/page-views with request", async () => {
    mockPost.mockResolvedValueOnce({});
    const request = { path: "/home", sessionId: "sess-1" };
    await analyticsApi.trackPageView(request);
    expect(mockPost).toHaveBeenCalledWith("/analytics/page-views", request);
  });

  it("trackPageView includes queryString when provided", async () => {
    mockPost.mockResolvedValueOnce({});
    const request = { path: "/items", queryString: "?category=geography", sessionId: "sess-2" };
    await analyticsApi.trackPageView(request);
    expect(mockPost).toHaveBeenCalledWith("/analytics/page-views", request);
  });

  it("trackPageView does not throw on failure (fire-and-forget)", async () => {
    mockPost.mockResolvedValueOnce({});
    await expect(analyticsApi.trackPageView({ path: "/x", sessionId: "s" })).resolves.not.toThrow();
  });

  it("trackEvents calls POST /analytics/events with the batch", async () => {
    mockPost.mockResolvedValueOnce({});
    const request = {
      sessionId: "sess-3",
      events: [{ name: "quiz_completed", path: "/quiz", runId: "r1", score: 3, total: 5 }],
    };
    await analyticsApi.trackEvents(request);
    expect(mockPost).toHaveBeenCalledWith("/analytics/events", request);
  });
});
