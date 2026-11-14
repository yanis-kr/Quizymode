import { cleanup, renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useListenAll } from "./useListenAll";

type FakeUtterance = { text: string; onend?: () => void; onerror?: () => void };

const spoken: FakeUtterance[] = [];

vi.mock("@/utils/speechSynthesis", () => ({
  isSpeechSynthesisSupported: () => true,
  createSpeechUtterances: ({ text }: { text: string }) => [{ text } as FakeUtterance],
}));

const items = [
  { id: "a", question: "Q1", correctAnswer: "A1" },
  { id: "b", question: "Q2", correctAnswer: "A2" },
];

function finishLastUtterance(): void {
  const last = spoken[spoken.length - 1];
  act(() => {
    last.onend?.();
  });
}

describe("useListenAll", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    spoken.length = 0;
    vi.stubGlobal("speechSynthesis", {
      speak: (u: FakeUtterance) => spoken.push(u),
      cancel: vi.fn(),
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("speaks question and answer for every item when no predicate is given", () => {
    const { result } = renderHook(() => useListenAll(items));
    act(() => result.current.handleButton());
    expect(spoken.map((u) => u.text)).toEqual(["Q1"]);
    finishLastUtterance();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(spoken.map((u) => u.text)).toEqual(["Q1", "A1"]);
  });

  it("speaks only the question when the answer is hidden and moves on to the next item", () => {
    const { result } = renderHook(() => useListenAll(items, (item) => item.id === "b"));
    act(() => result.current.handleButton());
    finishLastUtterance();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    // The hidden answer A1 was skipped; after the short gap the next question plays.
    expect(spoken.map((u) => u.text)).toEqual(["Q1", "Q2"]);

    finishLastUtterance();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    // The revealed answer A2 is spoken.
    expect(spoken.map((u) => u.text)).toEqual(["Q1", "Q2", "A2"]);
    expect(spoken.some((u) => u.text === "A1")).toBe(false);
  });

  it("hiding answers during the pause after the question skips that answer", () => {
    let audible = true;
    const { result, rerender } = renderHook(() => useListenAll(items, () => audible));
    act(() => result.current.handleButton());
    finishLastUtterance();
    // The question is done and the 2-second pause is running; the visitor turns Show answers off.
    audible = false;
    rerender();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(spoken.some((u) => u.text === "A1")).toBe(false);
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(spoken.map((u) => u.text)).toEqual(["Q1", "Q2"]);
  });
});
