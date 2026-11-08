import { beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError, type AxiosResponse } from "axios";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import { reviewQueueApi } from "@/api/learningLoop";
import { claimLocalReviewList } from "./claimLocalReviewList";
import { GUEST_REVIEW_LIST_STORAGE_KEY, addLocalReviewItems, readLocalReviewList } from "./localReviewList";

vi.mock("@/api/learningLoop", () => ({ reviewQueueApi: { enqueue: vi.fn() } }));

const idA = "00000000-0000-4000-8000-00000000000a";
const idB = "00000000-0000-4000-8000-00000000000b";
const idC = "00000000-0000-4000-8000-00000000000c";

function httpError(status: number): AxiosError {
  return new AxiosError("failed", "ERR", undefined, undefined, { status, data: {} } as AxiosResponse);
}

describe("claimLocalReviewList (AC 3.14.16)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    installMemoryLocalStorage();
    vi.mocked(reviewQueueApi.enqueue).mockResolvedValue({ itemId: "x", intervalDays: 1, dueAt: "" });
  });

  it("does nothing without a guest list", async () => {
    expect(await claimLocalReviewList()).toBe(false);
    expect(reviewQueueApi.enqueue).not.toHaveBeenCalled();
  });

  it("posts the stored ids in order and clears the local copy", async () => {
    addLocalReviewItems([idA, idB]);
    expect(await claimLocalReviewList()).toBe(true);
    expect(vi.mocked(reviewQueueApi.enqueue).mock.calls.map((call) => call[0])).toEqual([idA, idB]);
    expect(window.localStorage.getItem(GUEST_REVIEW_LIST_STORAGE_KEY)).toBeNull();
  });

  it("drops an id the server rejects (404 or 400) and continues", async () => {
    addLocalReviewItems([idA, idB, idC]);
    vi.mocked(reviewQueueApi.enqueue)
      .mockRejectedValueOnce(httpError(404))
      .mockResolvedValueOnce({ itemId: idB, intervalDays: 1, dueAt: "" })
      .mockRejectedValueOnce(httpError(400));
    expect(await claimLocalReviewList()).toBe(true);
    expect(window.localStorage.getItem(GUEST_REVIEW_LIST_STORAGE_KEY)).toBeNull();
  });

  it("stops on a server or network failure and keeps the rest for a later page session", async () => {
    addLocalReviewItems([idA, idB, idC]);
    vi.mocked(reviewQueueApi.enqueue).mockResolvedValueOnce({ itemId: idA, intervalDays: 1, dueAt: "" }).mockRejectedValueOnce(httpError(503));
    expect(await claimLocalReviewList()).toBe(true);
    expect(readLocalReviewList().map((entry) => entry.itemId)).toEqual([idB, idC]);
    expect(reviewQueueApi.enqueue).toHaveBeenCalledTimes(2);
  });
});
