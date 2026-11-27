import { describe, expect, it, vi } from "vitest";
import { queryClient } from "./queryClient";
import { refusal } from "@/test/refusal";

describe("queryClient retry", () => {
  const calls = async (error: Error) => {
    const queryFn = vi.fn().mockRejectedValue(error);
    await expect(
      queryClient.fetchQuery({
        queryKey: ["retry", error.message],
        queryFn,
        retry: queryClient.getDefaultOptions().queries?.retry,
        retryDelay: 0,
      })
    ).rejects.toBe(error);
    return queryFn.mock.calls.length;
  };

  it("AC 17.8 does not retry a request refused with 429", async () => {
    expect(await calls(refusal("Too many requests.", 429))).toBe(1);
  });

  it("retries any other failure once", async () => {
    expect(await calls(refusal("Broken.", 500))).toBe(2);
  });
});
