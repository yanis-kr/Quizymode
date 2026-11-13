import { beforeEach, describe, expect, it } from "vitest";
import {
  STARTER_RUN_STORAGE_KEY,
  clearStoredStarterRun,
  readStoredStarterRun,
  writeStoredStarterRun,
} from "./starterRunStorage";

const IDS = ["a", "b", "c", "d", "e"];

describe("starterRunStorage", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("round-trips the nonce and the five item ids in order", () => {
    writeStoredStarterRun({ nonce: "n-1", itemIds: IDS });
    expect(readStoredStarterRun()).toEqual({ nonce: "n-1", itemIds: IDS });
  });

  it("clears the saved run", () => {
    writeStoredStarterRun({ nonce: "n-1", itemIds: IDS });
    clearStoredStarterRun();
    expect(readStoredStarterRun()).toBeNull();
  });

  it.each([
    ["missing", null],
    ["not JSON", "{oops"],
    ["wrong version", JSON.stringify({ version: 2, nonce: "n", itemIds: IDS })],
    ["no nonce", JSON.stringify({ version: 1, itemIds: IDS })],
    ["four items", JSON.stringify({ version: 1, nonce: "n", itemIds: IDS.slice(0, 4) })],
    ["repeated item", JSON.stringify({ version: 1, nonce: "n", itemIds: ["a", "a", "b", "c", "d"] })],
    ["oversized", JSON.stringify({ version: 1, nonce: "n", itemIds: IDS, pad: "x".repeat(4000) })],
  ])("treats a %s saved run as missing", (_label, raw) => {
    if (raw !== null) window.sessionStorage.setItem(STARTER_RUN_STORAGE_KEY, raw);
    expect(readStoredStarterRun()).toBeNull();
  });
});
