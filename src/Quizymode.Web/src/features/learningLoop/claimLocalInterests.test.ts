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
});
