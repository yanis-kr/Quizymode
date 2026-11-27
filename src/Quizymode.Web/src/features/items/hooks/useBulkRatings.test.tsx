import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { patchBulkRating, useBulkRatings } from "./useBulkRatings";
import { ratingsApi } from "@/api/ratings";
import { refusal } from "@/test/refusal";

vi.mock("@/api/ratings", () => ({ ratingsApi: { getStats: vi.fn() } }));

const ids = Array.from({ length: 100 }, (_, index) => `item-${String(index).padStart(3, "0")}`);
const stats = (itemId: string, averageStars: number | null) => ({ itemId, averageStars, count: 1 });

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe("useBulkRatings (AC 17.11)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(ratingsApi.getStats).mockImplementation(async (itemId) => stats(itemId, 3));
  });

  it("sends one request per item, then one more for a rated item, and none on focus or remount", async () => {
    const { queryClient, wrapper } = setup();
    const first = renderHook(() => useBulkRatings([...ids]), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    expect(ratingsApi.getStats).toHaveBeenCalledTimes(100);

    vi.mocked(ratingsApi.getStats).mockImplementation(async (itemId) => stats(itemId, 5));
    await act(() => patchBulkRating(queryClient, "item-007"));

    await waitFor(() => expect(first.result.current.ratingsMap.get("item-007")).toBe(5));
    expect(first.result.current.ratingsMap.get("item-008")).toBe(3);
    expect(ratingsApi.getStats).toHaveBeenCalledTimes(101);

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    first.unmount();
    const second = renderHook(() => useBulkRatings([...ids]), { wrapper });
    expect(second.result.current.ratingsMap.get("item-007")).toBe(5);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(ratingsApi.getStats).toHaveBeenCalledTimes(101);
    focusManager.setFocused(undefined);
  });

  it("requests nothing for an item no bulk map holds", async () => {
    const { queryClient } = setup();
    await patchBulkRating(queryClient, "item-001");
    expect(ratingsApi.getStats).not.toHaveBeenCalled();
  });

  it("keeps the old value, never 'unrated', when the single refresh is refused", async () => {
    const { queryClient, wrapper } = setup();
    const view = renderHook(() => useBulkRatings(["a", "b"]), { wrapper });
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    vi.mocked(ratingsApi.getStats).mockRejectedValue(refusal("Too many requests."));

    await act(() => patchBulkRating(queryClient, "a"));

    expect(view.result.current.ratingsMap.get("a")).toBe(3);
    expect(ratingsApi.getStats).toHaveBeenCalledTimes(3);
  });

  it("stays stale after a failed refresh even when a later one succeeds", async () => {
    const { queryClient, wrapper } = setup();
    const view = renderHook(() => useBulkRatings(["a", "b"]), { wrapper });
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    vi.mocked(ratingsApi.getStats).mockRejectedValueOnce(refusal("Too many requests."));
    await act(() => patchBulkRating(queryClient, "a"));
    vi.mocked(ratingsApi.getStats).mockImplementation(async (itemId) => stats(itemId, 5));

    await act(() => patchBulkRating(queryClient, "b"));

    await waitFor(() => expect(view.result.current.ratingsMap.get("b")).toBe(5));
    expect(
      queryClient.getQueryCache().find({ queryKey: ["ratingStats", "bulk", "a,b"] })?.state.isInvalidated
    ).toBe(true);
    expect(ratingsApi.getStats).toHaveBeenCalledTimes(4);

    view.unmount();
    const next = renderHook(() => useBulkRatings(["a", "b"]), { wrapper });
    await waitFor(() => expect(next.result.current.ratingsMap.get("a")).toBe(5));
    expect(ratingsApi.getStats).toHaveBeenCalledTimes(6);
  });

  it.each(["first load", "reload"])(
    "does not let a %s already under way bring back the value from before the rating",
    async (kind) => {
      const { queryClient, wrapper } = setup();
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      // Every value is read before the rating; "b" holds the load open.
      const holdB = () =>
        vi.mocked(ratingsApi.getStats).mockImplementation(async (itemId) => {
          if (itemId === "b") await held;
          return stats(itemId, 3);
        });
      if (kind === "first load") holdB();
      const view = renderHook(() => useBulkRatings(["a", "b"]), { wrapper });
      if (kind === "reload") {
        await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
        holdB();
        act(() => {
          void view.result.current.refetch();
        });
      }
      await waitFor(() => expect(queryClient.isFetching()).toBe(1));
      vi.mocked(ratingsApi.getStats).mockImplementation(async (itemId) =>
        stats(itemId, itemId === "a" ? 5 : 3)
      );

      await act(() => patchBulkRating(queryClient, "a"));
      await act(async () => release());

      await waitFor(() => expect(queryClient.isFetching()).toBe(0));
      await waitFor(() => expect(view.result.current.ratingsMap.get("a")).toBe(5));
      expect(view.result.current.ratingsMap.get("b")).toBe(3);
    }
  );

  it("reports a 429 as an error instead of returning unrated items", async () => {
    const { wrapper } = setup();
    vi.mocked(ratingsApi.getStats).mockImplementation(async (itemId) => {
      if (itemId === "b") throw refusal("Too many requests.");
      return stats(itemId, 3);
    });

    const view = renderHook(() => useBulkRatings(["a", "b"]), { wrapper });

    await waitFor(() => expect(view.result.current.isError).toBe(true));
    expect(view.result.current.ratingsMap.size).toBe(0);
  });

  it("still treats another failed lookup as unrated", async () => {
    const { wrapper } = setup();
    vi.mocked(ratingsApi.getStats).mockRejectedValue(refusal("Broken.", 500));

    const view = renderHook(() => useBulkRatings(["a"]), { wrapper });

    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    expect(view.result.current.ratingsMap.get("a")).toBeNull();
  });
});
