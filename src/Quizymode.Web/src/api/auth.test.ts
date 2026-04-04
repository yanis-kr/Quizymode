import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetToken } = vi.hoisted(() => ({
  mockGetToken: vi.fn(),
}));

vi.mock("@/utils/tokenStorage", () => ({
  getToken: mockGetToken,
}));

vi.mock("./client", () => ({
  API_URL: "/api",
}));

import { authApi } from "./auth";

describe("authApi", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns early when no token is available", async () => {
    mockGetToken.mockReturnValueOnce(null);

    await authApi.logoutAudit();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the logout audit with the bearer token", async () => {
    mockGetToken.mockReturnValueOnce("token-123");
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await authApi.logoutAudit();

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", {
      method: "POST",
      headers: {
        Authorization: "Bearer token-123",
      },
    });
  });

  it("swallows fetch failures because logout audit is best effort", async () => {
    mockGetToken.mockReturnValueOnce("token-123");
    fetchMock.mockRejectedValueOnce(new Error("network"));

    await expect(authApi.logoutAudit()).resolves.toBeUndefined();
  });
});
