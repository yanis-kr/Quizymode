import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createElement } from "react";
import { usePageSize } from "./usePageSize";

const mockGetSettings = vi.fn();
const mockUpdateSetting = vi.fn();

vi.mock("@/api/users", () => ({
  usersApi: {
    getSettings: () => mockGetSettings(),
    updateSetting: (req: unknown) => mockUpdateSetting(req),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseAuth = vi.fn();

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("usePageSize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns default page size (10) when not authenticated", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false });
    const { result } = renderHook(() => usePageSize(), { wrapper: makeWrapper() });
    expect(result.current.pageSize).toBe(10);
  });

  it("returns page size from settings when authenticated", async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    mockGetSettings.mockResolvedValue({ settings: { PageSize: "25" } });

    const { result } = renderHook(() => usePageSize(), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(result.current.pageSize).toBe(25);
    });
  });

  it("returns default page size when PageSize setting is missing", async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    mockGetSettings.mockResolvedValue({ settings: {} });

    const { result } = renderHook(() => usePageSize(), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(result.current.pageSize).toBe(10);
    });
  });

  it("clamps page size to minimum of 1", async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    mockGetSettings.mockResolvedValue({ settings: { PageSize: "0" } });

    const { result } = renderHook(() => usePageSize(), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(result.current.pageSize).toBeGreaterThanOrEqual(1);
    });
  });

  it("clamps page size to maximum of 1000", async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    mockGetSettings.mockResolvedValue({ settings: { PageSize: "99999" } });

    const { result } = renderHook(() => usePageSize(), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(result.current.pageSize).toBeLessThanOrEqual(1000);
    });
  });

  it("does not call updateSetting when not authenticated", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false });
    const { result } = renderHook(() => usePageSize(), { wrapper: makeWrapper() });

    act(() => {
      result.current.updatePageSize(20);
    });

    expect(mockUpdateSetting).not.toHaveBeenCalled();
  });
});
