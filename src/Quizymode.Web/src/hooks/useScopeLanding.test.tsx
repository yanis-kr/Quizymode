import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useScopeLanding, type ScopeLandingInput } from "./useScopeLanding";
import { itemsApi } from "@/api/items";
import { featuredApi } from "@/api/featured";
import { gamesApi } from "@/api/games";

vi.mock("@/api/items", () => ({ itemsApi: { getAll: vi.fn() } }));
vi.mock("@/api/featured", () => ({ featuredApi: { get: vi.fn() } }));
vi.mock("@/api/games", () => ({ gamesApi: { getRoster: vi.fn() } }));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const base: ScopeLandingInput = {
  categoryName: "Trivia",
  categorySlug: "trivia",
  nav: ["brain-teasers"],
  categoryDescription: "Fun facts.",
  enabled: true,
};

const rosterOf = (n: number) => ({ items: Array.from({ length: n }, (_, i) => ({ id: String(i) })), scopes: [] }) as never;

describe("useScopeLanding (#646)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(featuredApi.get).mockResolvedValue({ sets: [], collections: [] });
    vi.mocked(itemsApi.getAll).mockResolvedValue({ items: [], totalCount: 12, page: 1, pageSize: 1, totalPages: 12 } as never);
    vi.mocked(gamesApi.getRoster).mockResolvedValue(rosterOf(3));
  });

  it("starts loading, then reports the unfiltered count and Games availability", async () => {
    const { result } = renderHook(() => useScopeLanding(base), { wrapper: wrapper() });
    expect(result.current.countState).toBe("loading");
    expect(result.current.games).toBe("loading");
    await waitFor(() => expect(result.current.countState).toBe("ready"));
    await waitFor(() => expect(result.current.games).toBe("available"));
    expect(result.current.count).toBe(12);
    expect(gamesApi.getRoster).toHaveBeenCalledWith(["Trivia/brain-teasers"], 3);
  });

  it("title falls back to the keyword display name and the category name", async () => {
    const keyword = renderHook(
      () => useScopeLanding({ ...base, keywordDescriptions: [{ name: "brain-teasers", description: "Puzzles." }] }),
      { wrapper: wrapper() }
    );
    expect(keyword.result.current.title).toBe("Brain Teasers");
    expect(keyword.result.current.description).toBe("Puzzles.");

    const root = renderHook(() => useScopeLanding({ ...base, nav: [] }), { wrapper: wrapper() });
    expect(root.result.current.title).toBe("Trivia");
    expect(root.result.current.description).toBe("Fun facts.");
  });

  it("marks Games unavailable below the minimum roster and on roster errors", async () => {
    vi.mocked(gamesApi.getRoster).mockResolvedValue(rosterOf(2));
    const few = renderHook(() => useScopeLanding(base), { wrapper: wrapper() });
    await waitFor(() => expect(few.result.current.games).toBe("unavailable"));

    vi.mocked(gamesApi.getRoster).mockRejectedValue(new Error("boom"));
    const failed = renderHook(() => useScopeLanding(base), { wrapper: wrapper() });
    await waitFor(() => expect(failed.result.current.games).toBe("unavailable"));
  });

  it("reports a count error without throwing and fetches nothing when disabled", async () => {
    vi.mocked(itemsApi.getAll).mockRejectedValue(new Error("boom"));
    const failed = renderHook(() => useScopeLanding(base), { wrapper: wrapper() });
    await waitFor(() => expect(failed.result.current.countState).toBe("error"));

    vi.clearAllMocks();
    renderHook(() => useScopeLanding({ ...base, enabled: false }), { wrapper: wrapper() });
    expect(itemsApi.getAll).not.toHaveBeenCalled();
    expect(gamesApi.getRoster).not.toHaveBeenCalled();
    expect(featuredApi.get).not.toHaveBeenCalled();
  });
});
