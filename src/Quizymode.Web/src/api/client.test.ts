import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError } from "axios";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";

const mockFetchAuthSession = vi.fn();

vi.mock("aws-amplify/auth", () => ({
  fetchAuthSession: (...args: unknown[]) => mockFetchAuthSession(...args),
}));

import { apiClient } from "./client";
import { getToken, setTokens } from "@/utils/tokenStorage";
import { installMemoryLocalStorage } from "@/test/memoryStorage";

function fakeJwt(tag: string): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, tag }));
  return `h.${payload}.s`;
}

const OLD_ID = fakeJwt("old-id");
const OLD_ACCESS = fakeJwt("old-access");
const NEW_ID = fakeJwt("new-id");
const NEW_ACCESS = fakeJwt("new-access");

function respond(config: InternalAxiosRequestConfig, status: number, data: unknown = {}) {
  const response = { data, status, statusText: String(status), headers: {}, config };
  if (status >= 200 && status < 300) return Promise.resolve(response);
  return Promise.reject(new AxiosError(`HTTP ${status}`, "ERR_BAD_REQUEST", config, null, response));
}

function stubAdapter(statuses: number[]) {
  const calls: InternalAxiosRequestConfig[] = [];
  const adapter = vi.fn((config: InternalAxiosRequestConfig) => {
    calls.push(config);
    const status = statuses[Math.min(calls.length - 1, statuses.length - 1)];
    return respond(config, status);
  });
  apiClient.defaults.adapter = adapter as unknown as AxiosAdapter;
  return { adapter, calls };
}

function stubLocation(pathname: string) {
  const location = { pathname, href: "http://localhost" + pathname };
  vi.stubGlobal("location", location);
  return location;
}

describe("apiClient response interceptor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMemoryLocalStorage();
    setTokens(OLD_ACCESS, OLD_ID);
    mockFetchAuthSession.mockResolvedValue({
      tokens: {
        accessToken: { toString: () => NEW_ACCESS },
        idToken: { toString: () => NEW_ID },
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("passes a 403 through without refresh, retry, token clearing or redirect", async () => {
    const location = stubLocation("/admin/ai-providers");
    const { adapter } = stubAdapter([403]);

    await expect(apiClient.get("/admin/llm-providers")).rejects.toMatchObject({
      response: { status: 403 },
    });

    expect(adapter).toHaveBeenCalledTimes(1);
    expect(mockFetchAuthSession).not.toHaveBeenCalled();
    expect(getToken()).toBe(OLD_ID);
    expect(localStorage.getItem("accessToken")).toBe(OLD_ACCESS);
    expect(location.href).toBe("http://localhost/admin/ai-providers");
  });

  it("refreshes once on a 401 and retries with the new bearer token", async () => {
    stubLocation("/admin/ai-providers");
    const { adapter, calls } = stubAdapter([401, 200]);

    const response = await apiClient.get("/admin/llm-providers");

    expect(response.status).toBe(200);
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(mockFetchAuthSession).toHaveBeenCalledTimes(1);
    expect(mockFetchAuthSession).toHaveBeenCalledWith({ forceRefresh: true });
    expect(calls[1].headers.Authorization).toBe(`Bearer ${NEW_ID}`);
  });

  it("clears tokens and redirects to / when the retried request is 401 on a protected route", async () => {
    const location = stubLocation("/admin/ai-providers");
    stubAdapter([401, 401]);

    await expect(apiClient.get("/my-items")).rejects.toMatchObject({ response: { status: 401 } });

    expect(getToken()).toBeNull();
    expect(location.href).toBe("/");
  });

  it("clears tokens but does not redirect when the failed endpoint is public", async () => {
    const location = stubLocation("/admin/ai-providers");
    stubAdapter([401, 401]);

    await expect(apiClient.get("/categories")).rejects.toMatchObject({ response: { status: 401 } });

    expect(getToken()).toBeNull();
    expect(location.href).toBe("http://localhost/admin/ai-providers");
  });

  it("clears tokens when the refresh itself fails", async () => {
    stubLocation("/admin/ai-providers");
    const { adapter } = stubAdapter([401]);
    mockFetchAuthSession.mockRejectedValue(new Error("refresh token expired"));

    await expect(apiClient.get("/my-items")).rejects.toMatchObject({ response: { status: 401 } });

    expect(adapter).toHaveBeenCalledTimes(1);
    expect(getToken()).toBeNull();
  });

  it("rejects a 403 on the retry after a 401 refresh without clearing the refreshed tokens", async () => {
    const location = stubLocation("/admin/ai-providers");
    const { adapter } = stubAdapter([401, 403]);

    await expect(apiClient.get("/admin/llm-providers")).rejects.toMatchObject({
      response: { status: 403 },
    });

    expect(adapter).toHaveBeenCalledTimes(2);
    expect(getToken()).toBe(NEW_ID);
    expect(localStorage.getItem("accessToken")).toBe(NEW_ACCESS);
    expect(location.href).toBe("http://localhost/admin/ai-providers");
  });

  it("passes a 500 through untouched", async () => {
    stubLocation("/admin/ai-providers");
    const { adapter } = stubAdapter([500]);

    await expect(apiClient.get("/my-items")).rejects.toMatchObject({ response: { status: 500 } });

    expect(adapter).toHaveBeenCalledTimes(1);
    expect(mockFetchAuthSession).not.toHaveBeenCalled();
    expect(getToken()).toBe(OLD_ID);
  });
});
