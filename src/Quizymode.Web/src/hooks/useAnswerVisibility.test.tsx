import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ANSWER_VISIBILITY_STORAGE_KEY, useAnswerVisibility } from "./useAnswerVisibility";

const auth = vi.hoisted(() => ({ value: { isAuthenticated: false, isLoading: false } }));
const usersApi = vi.hoisted(() => ({ getSettings: vi.fn(), updateSetting: vi.fn() }));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth.value }));
vi.mock("@/api/users", () => ({ usersApi }));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useAnswerVisibility", () => {
  beforeEach(() => {
    window.localStorage.clear();
    auth.value = { isAuthenticated: false, isLoading: false };
    usersApi.getSettings.mockReset();
    usersApi.updateSetting.mockReset().mockResolvedValue({});
  });

  it("hides answers by default for a guest", () => {
    const { result } = renderHook(() => useAnswerVisibility(), { wrapper: wrapper() });
    expect(result.current.showAll).toBe(false);
    expect(result.current.isReady).toBe(true);
  });

  it("toggling writes localStorage and survives a remount", () => {
    const first = renderHook(() => useAnswerVisibility(), { wrapper: wrapper() });
    act(() => first.result.current.toggleAll());
    expect(first.result.current.showAll).toBe(true);
    expect(window.localStorage.getItem(ANSWER_VISIBILITY_STORAGE_KEY)).toBe("true");
    first.unmount();

    const second = renderHook(() => useAnswerVisibility(), { wrapper: wrapper() });
    expect(second.result.current.showAll).toBe(true);
    act(() => second.result.current.toggleAll());
    expect(window.localStorage.getItem(ANSWER_VISIBILITY_STORAGE_KEY)).toBe("false");
    expect(second.result.current.showAll).toBe(false);
  });

  it("lets the URL override beat the saved choice, until the visitor toggles", () => {
    window.localStorage.setItem(ANSWER_VISIBILITY_STORAGE_KEY, "false");
    const { result } = renderHook(() => useAnswerVisibility(true), { wrapper: wrapper() });
    expect(result.current.showAll).toBe(true);
    expect(result.current.isReady).toBe(true);
    act(() => result.current.toggleAll());
    expect(result.current.showAll).toBe(false);
  });

  it("keeps a signed-in visitor hidden and disabled while the settings load, even with a saved show", async () => {
    window.localStorage.setItem(ANSWER_VISIBILITY_STORAGE_KEY, "true");
    auth.value = { isAuthenticated: true, isLoading: false };
    let resolve: (value: { settings: Record<string, string> }) => void = () => {};
    usersApi.getSettings.mockReturnValue(new Promise((r) => (resolve = r)));

    const { result } = renderHook(() => useAnswerVisibility(), { wrapper: wrapper() });
    expect(result.current.showAll).toBe(false);
    expect(result.current.isReady).toBe(false);

    await act(async () => resolve({ settings: { HideAnswers: "true" } }));
    await waitFor(() => expect(result.current.isReady).toBe(true));
    // The server hide wins over the saved local show.
    expect(result.current.showAll).toBe(false);
  });

  it("honours a saved server show", async () => {
    auth.value = { isAuthenticated: true, isLoading: false };
    usersApi.getSettings.mockResolvedValue({ settings: { HideAnswers: "false" } });
    const { result } = renderHook(() => useAnswerVisibility(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.showAll).toBe(true));
  });

  it("falls back to localStorage and enables the toggle when the settings request fails", async () => {
    window.localStorage.setItem(ANSWER_VISIBILITY_STORAGE_KEY, "true");
    auth.value = { isAuthenticated: true, isLoading: false };
    usersApi.getSettings.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useAnswerVisibility(), { wrapper: wrapper() });
    expect(result.current.isReady).toBe(false);
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.showAll).toBe(true);
  });

  it("defaults to hidden for a signed-in visitor with no server value and no saved choice", async () => {
    auth.value = { isAuthenticated: true, isLoading: false };
    usersApi.getSettings.mockResolvedValue({ settings: {} });
    const { result } = renderHook(() => useAnswerVisibility(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.showAll).toBe(false);
  });

  it("writes the server setting too when signed in", async () => {
    auth.value = { isAuthenticated: true, isLoading: false };
    usersApi.getSettings.mockResolvedValue({ settings: {} });
    const { result } = renderHook(() => useAnswerVisibility(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    act(() => result.current.toggleAll());
    expect(window.localStorage.getItem(ANSWER_VISIBILITY_STORAGE_KEY)).toBe("true");
    await waitFor(() => expect(usersApi.updateSetting).toHaveBeenCalledWith({ key: "HideAnswers", value: "false" }));
    expect(result.current.showAll).toBe(true);
  });

  it("reveals single items and clears them when the page key changes", () => {
    const { result, rerender } = renderHook(({ page }) => useAnswerVisibility(undefined, page), {
      wrapper: wrapper(),
      initialProps: { page: 1 },
    });
    act(() => result.current.toggleItem("a"));
    expect(result.current.revealedIds.has("a")).toBe(true);
    expect(result.current.isAnswerVisible("a")).toBe(true);
    expect(result.current.isAnswerVisible("b")).toBe(false);
    expect(result.current.showAll).toBe(false);

    rerender({ page: 2 });
    expect(result.current.revealedIds.has("a")).toBe(false);
    act(() => result.current.toggleItem("a"));
    act(() => result.current.toggleItem("a"));
    expect(result.current.revealedIds.has("a")).toBe(false);
  });
});
