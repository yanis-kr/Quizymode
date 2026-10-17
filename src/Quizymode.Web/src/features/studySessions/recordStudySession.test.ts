import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordAuthenticatedCompletion, toRecordRequest } from "./recordStudySession";
import type { QuizCompletionSnapshot } from "@/features/items/quiz/quizRun";

const { mockRecord } = vi.hoisted(() => ({ mockRecord: vi.fn() }));
vi.mock("@/api/studySessions", () => ({ studySessionsApi: { record: mockRecord } }));

const missed = "11111111-1111-4111-8111-111111111111";
const snapshot = {
  runId: "run-abc",
  scope: { kind: "global", navigationKeywords: [], filterKeywords: ["math"] },
  completedAt: new Date().toISOString(),
  correct: 3,
  total: 4,
  missedItemIds: [missed],
} as unknown as QuizCompletionSnapshot;

describe("recordAuthenticatedCompletion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps the snapshot to a minimal request", () => {
    expect(toRecordRequest(snapshot)).toEqual({
      runId: "run-abc",
      completedAt: snapshot.completedAt,
      correct: 3,
      total: 4,
      source: { kind: "global", filterKeywords: ["math"] },
      missedItemIds: [missed],
    });
  });

  it("saves once on success", async () => {
    mockRecord.mockResolvedValueOnce({});
    expect(await recordAuthenticatedCompletion(snapshot, [0])).toBe(true);
    expect(mockRecord).toHaveBeenCalledTimes(1);
  });

  it("retries a transient failure with the same run id", async () => {
    mockRecord.mockRejectedValueOnce(new Error("503")).mockResolvedValueOnce({});
    expect(await recordAuthenticatedCompletion(snapshot, [0])).toBe(true);
    expect(mockRecord).toHaveBeenCalledTimes(2);
    expect(mockRecord.mock.calls[1][0].runId).toBe("run-abc");
  });

  it("gives up quietly after exhausting retries", async () => {
    mockRecord.mockRejectedValue(new Error("down"));
    expect(await recordAuthenticatedCompletion(snapshot, [0, 0])).toBe(false);
    expect(mockRecord).toHaveBeenCalledTimes(3);
  });
});
