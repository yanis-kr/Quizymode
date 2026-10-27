import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describeAddResult, useAddMissesToReview } from "./useAddMissesToReview";
import { reviewQueueApi } from "@/api/learningLoop";

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: { isAuthenticated: true, isLoading: false },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mockAuth }));
vi.mock("@/api/learningLoop", () => ({ reviewQueueApi: { enqueue: vi.fn() } }));

function setup(runId: string, ids: string[]) {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const view = renderHook(({ id, list }) => useAddMissesToReview(id, list), {
    wrapper,
    initialProps: { id: runId, list: ids },
  });
  return { ...view, invalidate };
}

const httpError = (status: number) => ({ response: { status } });

describe("useAddMissesToReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.isAuthenticated = true;
    mockAuth.isLoading = false;
    vi.mocked(reviewQueueApi.enqueue).mockResolvedValue({ itemId: "x", intervalDays: 1, dueAt: "" });
  });

  it("is only available to signed-in users once auth has settled", () => {
    mockAuth.isAuthenticated = false;
    expect(setup("run-1", ["a"]).result.current.canAdd).toBe(false);
    mockAuth.isAuthenticated = true;
    mockAuth.isLoading = true;
    expect(setup("run-1", ["a"]).result.current.canAdd).toBe(false);
    mockAuth.isLoading = false;
    expect(setup("run-1", ["a"]).result.current.canAdd).toBe(true);
  });

  it("queues each unique id once, one after another, and refreshes the review queue", async () => {
    const order: string[] = [];
    let running = 0;
    let maxRunning = 0;
    vi.mocked(reviewQueueApi.enqueue).mockImplementation(async (id: string) => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await Promise.resolve();
      order.push(id);
      running -= 1;
      return { itemId: id, intervalDays: 1, dueAt: "" };
    });
    const { result, invalidate } = setup("run-1", ["a", "b", "a", "c"]);
    await act(async () => {
      await result.current.addAll();
    });
    expect(order).toEqual(["a", "b", "c"]);
    expect(maxRunning).toBe(1);
    expect(result.current).toMatchObject({ added: 3, unavailable: 0, failed: 0, attempted: true, isPending: false });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["review-queue"] });
  });

  it("separates 404 (unavailable) from every other failure, including 401, 429 and 500", async () => {
    vi.mocked(reviewQueueApi.enqueue).mockImplementation(async (id: string) => {
      if (id === "gone") throw httpError(404);
      if (id === "auth") throw httpError(401);
      if (id === "slow") throw httpError(429);
      if (id === "boom") throw httpError(500);
      if (id === "net") throw new Error("Network Error");
      return { itemId: id, intervalDays: 1, dueAt: "" };
    });
    const { result } = setup("run-1", ["ok", "gone", "auth", "slow", "boom", "net"]);
    await act(async () => {
      await result.current.addAll();
    });
    expect(result.current).toMatchObject({ added: 1, unavailable: 1, failed: 4 });
  });

  it("retries only the failed ids", async () => {
    vi.mocked(reviewQueueApi.enqueue).mockImplementation(async (id: string) => {
      if (id === "gone") throw httpError(404);
      if (id === "flaky") throw httpError(500);
      return { itemId: id, intervalDays: 1, dueAt: "" };
    });
    const { result } = setup("run-1", ["ok", "gone", "flaky"]);
    await act(async () => {
      await result.current.addAll();
    });
    expect(vi.mocked(reviewQueueApi.enqueue)).toHaveBeenCalledTimes(3);

    vi.mocked(reviewQueueApi.enqueue).mockClear();
    vi.mocked(reviewQueueApi.enqueue).mockResolvedValue({ itemId: "flaky", intervalDays: 1, dueAt: "" });
    await act(async () => {
      await result.current.addAll();
    });
    expect(vi.mocked(reviewQueueApi.enqueue).mock.calls).toEqual([["flaky"]]);
    expect(result.current).toMatchObject({ added: 2, unavailable: 1, failed: 0 });
  });

  it("does not refresh the review queue when nothing was added", async () => {
    vi.mocked(reviewQueueApi.enqueue).mockRejectedValue(httpError(500));
    const { result, invalidate } = setup("run-1", ["a"]);
    await act(async () => {
      await result.current.addAll();
    });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("makes no calls for an empty list or when everything is already settled", async () => {
    const empty = setup("run-1", []);
    await act(async () => {
      await empty.result.current.addAll();
    });
    expect(reviewQueueApi.enqueue).not.toHaveBeenCalled();

    const { result } = setup("run-2", ["a"]);
    await act(async () => {
      await result.current.addAll();
    });
    await act(async () => {
      await result.current.addAll();
    });
    expect(reviewQueueApi.enqueue).toHaveBeenCalledTimes(1);
  });

  it("starts clean for a new run id", async () => {
    const { result, rerender } = setup("run-1", ["a"]);
    await act(async () => {
      await result.current.addAll();
    });
    expect(result.current.added).toBe(1);
    rerender({ id: "run-2", list: ["a"] });
    expect(result.current).toMatchObject({ added: 0, attempted: false });
  });
});

describe("describeAddResult", () => {
  it("words each combination", () => {
    expect(describeAddResult(4, 0, 0)).toBe("Added 4 to Review.");
    expect(describeAddResult(3, 1, 0)).toBe("Added 3 to Review. 1 can't be added.");
    expect(describeAddResult(0, 1, 0)).toBe("This can't be added to Review.");
    expect(describeAddResult(0, 2, 0)).toBe("These can't be added to Review.");
    expect(describeAddResult(0, 0, 2)).toBe("Couldn't add 2 to Review.");
    expect(describeAddResult(2, 0, 1)).toBe("Added 2. Couldn't add 1.");
    expect(describeAddResult(0, 1, 2)).toBe("Couldn't add 2 to Review. 1 can't be added.");
  });
});
