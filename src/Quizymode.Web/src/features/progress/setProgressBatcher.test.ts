import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSetProgress } = vi.hoisted(() => ({ mockGetSetProgress: vi.fn() }));
vi.mock("@/api/studySessions", () => ({
  MAX_SET_PROGRESS_SCOPES: 12,
  studySessionsApi: { getSetProgress: mockGetSetProgress },
}));

import { fetchSetKnownCount, isValidSetScope } from "./setProgressBatcher";

describe("setProgressBatcher (#694)", () => {
  beforeEach(() => mockGetSetProgress.mockReset());

  it("drops an invalid scope client-side so the other tiles in the batch still load", async () => {
    mockGetSetProgress.mockResolvedValue({ scopes: [{ scope: "s/history", knownCount: 4 }] });

    const [good, bad] = await Promise.all([
      fetchSetKnownCount("s/history"),
      fetchSetKnownCount("s/Bad Slug!/x"),
    ]);

    expect(good).toBe(4);
    expect(bad).toBe(0);
    expect(mockGetSetProgress).toHaveBeenCalledTimes(1);
    expect(mockGetSetProgress).toHaveBeenCalledWith(["s/history"]);
  });

  it("mirrors the server scope rules", () => {
    expect(isValidSetScope("s/history")).toBe(true);
    expect(isValidSetScope("s/history/ancient/rome")).toBe(true);
    expect(isValidSetScope("s/history/a/b/c")).toBe(false);
    expect(isValidSetScope("s/history/has space")).toBe(false);
    expect(isValidSetScope("c/3f2504e0-4f89-41d3-9a0c-0305e82c3301")).toBe(true);
    expect(isValidSetScope("c/not-a-guid")).toBe(false);
    expect(isValidSetScope("c/00000000-0000-0000-0000-000000000000")).toBe(false);
    expect(isValidSetScope("x/foo")).toBe(false);
  });
});
