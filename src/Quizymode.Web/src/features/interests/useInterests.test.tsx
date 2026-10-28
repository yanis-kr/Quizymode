import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { interestsApi } from "@/api/learningLoop";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import { readLocalInterests, writeLocalInterests } from "@/features/learningLoop/localLearningState";
import { INTERESTS_QUERY_KEY, useInterests } from "./useInterests";

const auth = vi.hoisted(() => ({ value: { isAuthenticated: false, isLoading: false, userId: null as string | null } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth.value }));
vi.mock("@/api/learningLoop", () => ({ interestsApi: { get: vi.fn(), replace: vi.fn() } }));

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, ...renderHook(() => useInterests(), { wrapper }) };
}

describe("useInterests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMemoryLocalStorage();
    auth.value = { isAuthenticated: false, isLoading: false, userId: null };
  });

  it("guest: reads browser-local topics, is always ready, and saves locally", async () => {
    writeLocalInterests(["history"]);
    const { result } = setup();
    expect(result.current.status).toBe("ready");
    expect(result.current.isGuest).toBe(true);
    expect(result.current.interests).toEqual(["history"]);

    await act(() => result.current.save(["science", "history"]));
    expect(readLocalInterests()).toEqual(["science", "history"]);
    await waitFor(() => expect(result.current.interests).toEqual(["science", "history"]));
    expect(interestsApi.get).not.toHaveBeenCalled();
    expect(interestsApi.replace).not.toHaveBeenCalled();
  });

  it("signed in: loads then becomes ready, and save writes the account and the cache", async () => {
    auth.value = { isAuthenticated: true, isLoading: false, userId: "u1" };
    vi.mocked(interestsApi.get).mockResolvedValue(["exams"]);
    vi.mocked(interestsApi.replace).mockResolvedValue(["tech"]);
    const { result, client } = setup();
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.interests).toEqual(["exams"]);

    await act(() => result.current.save(["tech"]));
    expect(interestsApi.replace).toHaveBeenCalledWith(["tech"]);
    expect(client.getQueryData(INTERESTS_QUERY_KEY("u1"))).toEqual(["tech"]);
    expect(readLocalInterests()).toEqual([]);
  });

  it("signed in: a failed load is an error (not empty) and Retry recovers", async () => {
    auth.value = { isAuthenticated: true, isLoading: false, userId: "u1" };
    vi.mocked(interestsApi.get).mockRejectedValueOnce(new Error("down")).mockResolvedValue(["history"]);
    const { result } = setup();
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(interestsApi.get).toHaveBeenCalledTimes(1);

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.interests).toEqual(["history"]);
  });

  it("surfaces a failed save without changing the topics", async () => {
    auth.value = { isAuthenticated: true, isLoading: false, userId: "u1" };
    vi.mocked(interestsApi.get).mockResolvedValue(["exams"]);
    vi.mocked(interestsApi.replace).mockRejectedValue(new Error("down"));
    const { result } = setup();
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      await expect(result.current.save(["tech"])).rejects.toThrow();
    });
    await waitFor(() => expect(result.current.saveError).toBe(true));
    expect(result.current.interests).toEqual(["exams"]);
    act(() => result.current.resetSave());
    await waitFor(() => expect(result.current.saveError).toBe(false));
  });

  it("does not fetch when disabled", () => {
    auth.value = { isAuthenticated: true, isLoading: false, userId: "u1" };
    const client = new QueryClient();
    renderHook(() => useInterests({ enabled: false }), {
      wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });
    expect(interestsApi.get).not.toHaveBeenCalled();
  });
});
