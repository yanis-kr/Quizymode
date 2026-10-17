import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useCurrentUserId } from "./useCurrentUserId";

const authState = { isAuthenticated: true, userId: "cognito-sub-123" as string | null };

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

const getCurrent = vi.fn();
vi.mock("@/api/users", () => ({
  usersApi: { getCurrent: () => getCurrent() },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useCurrentUserId (#207)", () => {
  beforeEach(() => {
    getCurrent.mockReset();
    authState.isAuthenticated = true;
    authState.userId = "cognito-sub-123";
  });

  it("returns the internal Users.Id from /users/me, not the token sub", async () => {
    getCurrent.mockResolvedValue({ id: "internal-user-guid", name: null, email: null, isAdmin: false, createdAt: "", lastLogin: "" });

    const { result } = renderHook(() => useCurrentUserId(), { wrapper });

    await waitFor(() => expect(result.current).toBe("internal-user-guid"));
    expect(result.current).not.toBe("cognito-sub-123");
  });

  it("returns null and does not fetch when signed out", () => {
    authState.isAuthenticated = false;
    authState.userId = null;

    const { result } = renderHook(() => useCurrentUserId(), { wrapper });

    expect(result.current).toBeNull();
    expect(getCurrent).not.toHaveBeenCalled();
  });
});
