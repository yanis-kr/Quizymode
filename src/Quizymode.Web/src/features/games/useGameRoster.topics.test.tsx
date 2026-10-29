import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { gamesApi } from "@/api/games";
import { categoriesApi } from "@/api/categories";
import { interestsApi } from "@/api/learningLoop";
import { writeLocalInterests } from "@/features/learningLoop/localLearningState";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import { useGameRoster } from "./useGameRoster";

const auth = vi.hoisted(() => ({ value: { isAuthenticated: false, isLoading: false, userId: null as string | null } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth.value }));
vi.mock("@/api/games", () => ({ gamesApi: { getRoster: vi.fn() } }));
vi.mock("@/api/categories", () => ({ categoriesApi: { getAll: vi.fn() } }));
vi.mock("@/api/learningLoop", () => ({ interestsApi: { get: vi.fn(), replace: vi.fn() } }));

function setup(path = "/games") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes><Route path="/games/:category?" element={children} /></Routes></MemoryRouter></QueryClientProvider>;
  return renderHook(() => useGameRoster(), { wrapper });
}

describe("game roster topic snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMemoryLocalStorage();
    auth.value = { isAuthenticated: false, isLoading: false, userId: null };
    vi.mocked(gamesApi.getRoster).mockResolvedValue({ items: [], scopes: [] });
    vi.mocked(categoriesApi.getAll).mockResolvedValue({ categories: [{ category: "science" }] } as never);
    vi.mocked(interestsApi.get).mockResolvedValue([]);
  });

  it("requests all ten saved topics, including full refinements", async () => {
    const topics = ["languages/french/core", ...Array.from({ length: 9 }, (_, index) => `c${index}`)];
    writeLocalInterests(topics);
    setup();
    await waitFor(() => expect(gamesApi.getRoster).toHaveBeenCalledWith(topics, 200));
  });

  it("keeps the current page's scope when topics change and applies edits on the next mount", async () => {
    writeLocalInterests(["languages/french"]);
    const current = setup();
    await waitFor(() => expect(gamesApi.getRoster).toHaveBeenCalledTimes(1));
    act(() => { writeLocalInterests(["languages/german"]); });
    expect(current.result.current.scope).toMatchObject({ kind: "topics", topics: ["languages/french"] });
    expect(gamesApi.getRoster).toHaveBeenCalledTimes(1);
    current.unmount();
    setup();
    await waitFor(() => expect(gamesApi.getRoster).toHaveBeenLastCalledWith(["languages/german"], 200));
  });

  it("never fetches globally before the visitor chooses", async () => {
    const current = setup();
    await waitFor(() => expect(current.result.current.topicPrompt).not.toBeNull());
    expect(gamesApi.getRoster).not.toHaveBeenCalled();
    expect(current.result.current.isPending).toBe(false);
  });

  it("waits for account topics and does not broaden on a load error", async () => {
    auth.value = { isAuthenticated: true, isLoading: false, userId: "user-1" };
    let reject!: (reason: Error) => void;
    vi.mocked(interestsApi.get).mockReturnValue(new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }));
    const current = setup();
    await waitFor(() => expect(interestsApi.get).toHaveBeenCalled());
    expect(gamesApi.getRoster).not.toHaveBeenCalled();
    expect(current.result.current.isPending).toBe(true);
    await act(async () => { reject(new Error("offline")); });
    await waitFor(() => expect(current.result.current.topicPrompt?.props.mode).toBe("error"));
    expect(gamesApi.getRoster).not.toHaveBeenCalled();
  });

  it("explicit All topics bypasses account loading", async () => {
    auth.value = { isAuthenticated: true, isLoading: false, userId: "user-1" };
    setup("/games?all=1");
    await waitFor(() => expect(gamesApi.getRoster).toHaveBeenCalledWith([], 200));
    expect(interestsApi.get).not.toHaveBeenCalled();
  });

  it("keeps URL category/navigation scope even with all=1 and saved preferences", async () => {
    writeLocalInterests(["history"]);
    setup("/games/science?nav=physics&all=1");
    await waitFor(() => expect(gamesApi.getRoster).toHaveBeenCalledWith(["science/physics"], 200));
  });
});
