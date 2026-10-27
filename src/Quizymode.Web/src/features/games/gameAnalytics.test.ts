import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockTrackEventOnce } = vi.hoisted(() => ({ mockTrackEventOnce: vi.fn() }));
vi.mock("@/features/analytics/analyticsEvents", () => ({ trackEventOnce: mockTrackEventOnce }));

import { gameEventContext, trackGameCompleted, trackGameStarted } from "./gameAnalytics";
import type { GameScope } from "./gameScope";

const category: GameScope = { kind: "category", category: "Science", navigationKeywords: [], filterKeywords: [] };

describe("gameAnalytics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends game_started with run id, total and the game context", () => {
    trackGameStarted("match-race", category, "run-1", 6);
    expect(mockTrackEventOnce).toHaveBeenCalledWith(expect.any(String), {
      name: "game_started",
      runId: "run-1",
      total: 6,
      contextType: "game",
      contextId: "match-race:category:science",
    });
  });

  it("sends game_completed with score and total but no time or item data", () => {
    trackGameCompleted("match-race", { kind: "global", filterKeywords: [] }, "run-1", 4, 6);
    const [, payload] = mockTrackEventOnce.mock.calls[0];
    expect(payload).toEqual({
      name: "game_completed",
      runId: "run-1",
      score: 4,
      total: 6,
      contextType: "game",
      contextId: "match-race:global",
    });
  });

  it("falls back to the game id when the scope does not fit the context id pattern", () => {
    const odd: GameScope = { kind: "collection", collectionId: "x".repeat(200), collectionName: null };
    expect(gameEventContext("match-race", odd)).toEqual({ contextType: "game", contextId: "match-race" });
  });
});
