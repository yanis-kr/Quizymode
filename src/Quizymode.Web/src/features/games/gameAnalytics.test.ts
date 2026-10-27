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

  it("builds swipe-blitz and survival context ids", () => {
    expect(gameEventContext("swipe-blitz", category)).toEqual({
      contextType: "game",
      contextId: "swipe-blitz:category:science",
    });
    const collection: GameScope = { kind: "collection", collectionId: "11111111-1111-4111-8111-111111111111" };
    expect(gameEventContext("survival", collection).contextId).toBe(
      "survival:collection:11111111-1111-4111-8111-111111111111",
    );
    expect(gameEventContext("survival", { kind: "global", filterKeywords: [] }).contextId).toBe("survival:global");
  });

  it("keeps total within 1-500 and score within 0 to total as whole numbers", () => {
    trackGameStarted("survival", category, "run-a", 0);
    trackGameStarted("survival", category, "run-b", 900);
    trackGameCompleted("survival", category, "run-c", 7, 3);
    trackGameCompleted("survival", category, "run-d", -2, 0);
    trackGameCompleted("survival", category, "run-e", 2.9, 4.7);
    const payloads = mockTrackEventOnce.mock.calls.map(([, payload]) => payload);
    expect(payloads[0].total).toBe(1);
    expect(payloads[1].total).toBe(500);
    expect(payloads[2]).toMatchObject({ score: 3, total: 3 });
    expect(payloads[3]).toMatchObject({ score: 0, total: 1 });
    expect(payloads[4]).toMatchObject({ score: 2, total: 4 });
  });
});
