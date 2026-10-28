import { beforeEach, describe, expect, it, vi } from "vitest";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import { interestsApi } from "@/api/learningLoop";
import { claimLocalInterests } from "./claimLocalInterests";
import { readLocalInterests, writeLocalInterests } from "./localLearningState";

vi.mock("@/api/learningLoop", () => ({ interestsApi: { get: vi.fn(), replace: vi.fn() } }));

describe("claimLocalInterests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMemoryLocalStorage();
  });

  it("does nothing without local picks", async () => {
    expect(await claimLocalInterests()).toBe(false);
    expect(interestsApi.get).not.toHaveBeenCalled();
  });

  it("appends new local picks after the account's own order and clears the local copy", async () => {
    writeLocalInterests(["trivia", "history", "unknown-topic"]);
    vi.mocked(interestsApi.get).mockResolvedValue(["history", "exams"]);
    vi.mocked(interestsApi.replace).mockResolvedValue(["history", "exams", "trivia"]);

    expect(await claimLocalInterests()).toBe(true);
    expect(interestsApi.replace).toHaveBeenCalledWith(["history", "exams", "trivia"]);
    expect(readLocalInterests()).toEqual([]);
  });

  it("keeps the local copy for a later retry when the server fails", async () => {
    writeLocalInterests(["trivia"]);
    vi.mocked(interestsApi.get).mockRejectedValue(new Error("offline"));

    expect(await claimLocalInterests()).toBe(false);
    expect(readLocalInterests()).toEqual(["trivia"]);
  });

  it("#382: hands the merged list to the caller before the local copy is cleared", async () => {
    writeLocalInterests(["trivia"]);
    vi.mocked(interestsApi.get).mockResolvedValue(["history"]);
    vi.mocked(interestsApi.replace).mockResolvedValue(["history", "trivia"]);
    let localAtCallback: string[] = [];
    const onMerged = vi.fn(() => {
      localAtCallback = readLocalInterests();
    });

    expect(await claimLocalInterests(onMerged)).toBe(true);
    expect(onMerged).toHaveBeenCalledWith(["history", "trivia"]);
    expect(localAtCallback).toEqual(["trivia"]);
    expect(readLocalInterests()).toEqual([]);
  });

  it("#382: does not call the callback when the claim fails", async () => {
    writeLocalInterests(["trivia"]);
    vi.mocked(interestsApi.get).mockRejectedValue(new Error("offline"));
    const onMerged = vi.fn();

    expect(await claimLocalInterests(onMerged)).toBe(false);
    expect(onMerged).not.toHaveBeenCalled();
  });
});
