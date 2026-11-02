import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useQuestionPictureStatuses } from "./pictureGate";
import { createQuizRun, reduceQuizRun } from "@/features/items/quiz/quizRun";
import { getTestPalette } from "@/features/items/quiz/test/paletteSelectors";

const picture = { key: "curated:flags/fr", altText: "x" };
const items = [
  { id: "a", questionImage: picture },
  { id: "b", questionImage: picture },
  { id: "c", questionImage: picture },
  { id: "d", questionImage: picture },
  { id: "e", questionImage: null },
];

describe("unavailableIds (#403)", () => {
  it("lists only failed, stuck and unknown pictures: loading and loaded ones are still scored", () => {
    const { result } = renderHook(() => useQuestionPictureStatuses());
    act(() => {
      result.current.controlsFor(items[0] as never).onStatusChange("loading");
      result.current.controlsFor(items[1] as never).onStatusChange("error");
      result.current.controlsFor(items[2] as never).onStatusChange("stuck");
      result.current.controlsFor(items[3] as never).onStatusChange("unknown");
    });
    expect(result.current.unavailableIds(items)).toEqual(["b", "c", "d"]);
  });

  it("does not mark a loading picture as not scored in the palette and still scores it at submit", () => {
    const { result } = renderHook(() => useQuestionPictureStatuses());
    act(() => result.current.controlsFor(items[0] as never).onStatusChange("loading"));
    let run = createQuizRun(
      { kind: "global", category: null, navigationKeywords: [], filterKeywords: [], quizSize: 2 },
      ["a", "e"],
      "guest",
      "test",
    );
    run = reduceQuizRun(run, { type: "start-test", startedAt: "2026-01-01T00:00:00Z", timeLimitSec: null });
    const unavailable = result.current.unavailableIds(items);

    expect(getTestPalette(run, 0, unavailable).notScored).toBe(0);
    run = reduceQuizRun(run, { type: "submit", submittedAt: "2026-01-01T00:01:00Z", reason: "manual", unavailableItemIds: unavailable });
    expect(run.skipped).toEqual([]);
  });
});
