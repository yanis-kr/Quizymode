import { describe, expect, it } from "vitest";
import { chooseNextUp, type NextUpInputs } from "./nextUp";

const topic = { source: { kind: "global" as const, filterKeywords: [] as string[] }, mode: "quiz" as const };
const all: NextUpInputs = {
  completedQuiz: true,
  signedIn: true,
  dailyDone: false,
  reviewCount: 3,
  resume: { path: "/quiz/x/item", label: "X" },
  lastTopic: topic,
};

describe("chooseNextUp (AC 3.31.2)", () => {
  it("returns null without a completed quiz so Home keeps the first-visit hero", () => {
    expect(chooseNextUp({ ...all, completedQuiz: false })).toBeNull();
  });

  it("picks Daily first, then review, then resume, then last topic, then start", () => {
    expect(chooseNextUp(all)).toEqual({ kind: "daily" });
    expect(chooseNextUp({ ...all, dailyDone: true })).toEqual({ kind: "review", count: 3, signedIn: true });
    expect(chooseNextUp({ ...all, dailyDone: true, reviewCount: 0 })).toEqual({
      kind: "resume",
      path: "/quiz/x/item",
      label: "X",
    });
    expect(chooseNextUp({ ...all, dailyDone: true, reviewCount: 0, resume: null })).toEqual({
      kind: "topic",
      ...topic,
    });
    expect(chooseNextUp({ ...all, dailyDone: true, reviewCount: 0, resume: null, lastTopic: null })).toEqual({
      kind: "start",
    });
  });

  it("skips sources that are unknown (null) instead of assuming", () => {
    expect(chooseNextUp({ ...all, dailyDone: null, reviewCount: null })).toMatchObject({ kind: "resume" });
  });
});
