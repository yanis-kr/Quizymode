import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSearchRateLimit, searchApi } from "./search";

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));

vi.mock("./client", () => ({
  apiClient: { get: mockGet },
}));

function axiosError(status: number, headers: Record<string, string> = {}): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError("failed", "ERR_BAD_RESPONSE", config, null, {
    status,
    statusText: "",
    data: {},
    headers,
    config,
  });
}

describe("searchApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls GET /search with a CSV of types and passes the abort signal", async () => {
    const data = { query: "ai", groups: {} };
    mockGet.mockResolvedValueOnce({ data });
    const controller = new AbortController();

    const result = await searchApi.search(
      { q: "ai", types: ["categories", "items"], limit: 5, offset: 0 },
      controller.signal
    );

    expect(mockGet).toHaveBeenCalledWith("/search", {
      params: { q: "ai", types: "categories,items", limit: 5, offset: 0 },
      signal: controller.signal,
    });
    expect(result).toBe(data);
  });
});

describe("getSearchRateLimit", () => {
  it("reads Retry-After seconds from a 429", () => {
    expect(getSearchRateLimit(axiosError(429, { "retry-after": "12" }))).toEqual({ retryAfterSeconds: 12 });
  });

  it("returns null seconds when the header is missing or unreadable", () => {
    expect(getSearchRateLimit(axiosError(429))).toEqual({ retryAfterSeconds: null });
    expect(getSearchRateLimit(axiosError(429, { "retry-after": "soon" }))).toEqual({ retryAfterSeconds: null });
  });

  it("ignores other failures", () => {
    expect(getSearchRateLimit(axiosError(500))).toBeNull();
    expect(getSearchRateLimit(new Error("network"))).toBeNull();
  });
});
