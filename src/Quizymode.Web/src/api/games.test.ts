import { beforeEach, describe, expect, it, vi } from "vitest";
import { gamesApi } from "./games";

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));
vi.mock("./client", () => ({ apiClient: { get: mockGet } }));

describe("gamesApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getRoster calls GET /games/roster with one scope param per token and the limit", async () => {
    const data = { items: [], scopes: [{ scope: "science", available: 0, returned: 0, status: "empty" }] };
    mockGet.mockResolvedValueOnce({ data });

    const result = await gamesApi.getRoster(["science", "history/ancient"], 50);

    expect(result).toEqual(data);
    const [url, options] = mockGet.mock.calls[0];
    expect(url).toBe("/games/roster");
    expect(options.params).toBeInstanceOf(URLSearchParams);
    expect(options.params.getAll("scope")).toEqual(["science", "history/ancient"]);
    expect(options.params.get("limit")).toBe("50");
  });

  it("getRoster sends no scope param for the global scope and defaults the limit to 200", async () => {
    mockGet.mockResolvedValueOnce({ data: { items: [], scopes: [] } });

    await gamesApi.getRoster([]);

    const [, options] = mockGet.mock.calls[0];
    expect(options.params.has("scope")).toBe(false);
    expect(options.params.get("limit")).toBe("200");
  });
});
