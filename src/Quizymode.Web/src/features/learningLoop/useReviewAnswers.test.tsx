import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { reviewQueueApi } from "@/api/learningLoop";
import { useReviewAnswers } from "./useReviewAnswers";

vi.mock("@/api/learningLoop", () => ({ reviewQueueApi: { answer: vi.fn() } }));

function setup() {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { invalidate, ...renderHook(() => useReviewAnswers(), { wrapper }) };
}

const applied = (graduated = false) => ({ itemId: "x", applied: true, graduated, intervalDays: 3, dueAt: "" });

describe("useReviewAnswers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("tallies forward, back-tomorrow and done answers and refreshes the summary after each", async () => {
    vi.mocked(reviewQueueApi.answer)
      .mockResolvedValueOnce(applied())
      .mockResolvedValueOnce(applied())
      .mockResolvedValueOnce(applied(true));
    const { result, invalidate } = setup();

    await act(async () => {
      await result.current.recordAnswer("a", true);
      await result.current.recordAnswer("b", false);
      await result.current.recordAnswer("c", true);
    });

    expect(result.current.tally).toEqual({ forward: 1, reset: 1, graduated: 1, failed: 0 });
    expect(reviewQueueApi.answer).toHaveBeenNthCalledWith(1, "a", true);
    expect(reviewQueueApi.answer).toHaveBeenNthCalledWith(2, "b", false);
    expect(invalidate).toHaveBeenCalledTimes(3);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["review-queue", "summary"] });
  });

  it("does not tally or refresh for an answer the server did not apply", async () => {
    vi.mocked(reviewQueueApi.answer).mockResolvedValue({ itemId: "a", applied: false, graduated: false, intervalDays: 0, dueAt: "" });
    const { result, invalidate } = setup();

    await act(async () => {
      await result.current.recordAnswer("a", true);
    });

    expect(result.current.tally).toEqual({ forward: 0, reset: 0, graduated: 0, failed: 0 });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("counts a failed save, never throws and still refreshes the summary", async () => {
    vi.mocked(reviewQueueApi.answer).mockRejectedValue(new Error("offline"));
    const { result, invalidate } = setup();

    await act(async () => {
      await expect(result.current.recordAnswer("a", true)).resolves.toBeUndefined();
    });

    expect(result.current.tally.failed).toBe(1);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("settlePending waits for saves that are still running", async () => {
    let finish: (value: ReturnType<typeof applied>) => void = () => {};
    vi.mocked(reviewQueueApi.answer).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { result } = setup();

    let settled = false;
    act(() => {
      void result.current.recordAnswer("a", true);
    });
    const waiting = result.current.settlePending().then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    await act(async () => {
      finish(applied());
      await waiting;
    });
    expect(settled).toBe(true);
    await waitFor(() => expect(result.current.tally.forward).toBe(1));
  });

  it("resets the tally", async () => {
    vi.mocked(reviewQueueApi.answer).mockResolvedValue(applied());
    const { result } = setup();
    await act(async () => {
      await result.current.recordAnswer("a", true);
    });
    act(() => result.current.resetTally());
    expect(result.current.tally.forward).toBe(0);
  });
});
