import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useScopeLanding, type ScopeLandingInput } from "./useScopeLanding";
import { itemsApi } from "@/api/items";
import { featuredApi } from "@/api/featured";

vi.mock("@/api/items", () => ({ itemsApi: { getAll: vi.fn() } }));
vi.mock("@/api/featured", () => ({ featuredApi: { get: vi.fn() } }));

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

describe("useScopeLanding (#646)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(featuredApi.get).mockResolvedValue({ sets: [], collections: [] });
    vi.mocked(itemsApi.getAll).mockResolvedValue({ items: [], totalCount: 12, page: 1, pageSize: 1, totalPages: 12 } as never);
  });

  it("starts loading, then reports the unfiltered count", async () => {
    const { result } = renderHook(() => useScopeLanding(base), { wrapper: wrapper() });
    expect(result.current.countState).toBe("loading");
    await waitFor(() => expect(result.current.countState).toBe("ready"));
    expect(result.current.count).toBe(12);
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

  it("reports a count error without throwing and fetches nothing when disabled", async () => {
    vi.mocked(itemsApi.getAll).mockRejectedValue(new Error("boom"));
    const failed = renderHook(() => useScopeLanding(base), { wrapper: wrapper() });
    await waitFor(() => expect(failed.result.current.countState).toBe("error"));

    vi.clearAllMocks();
    renderHook(() => useScopeLanding({ ...base, enabled: false }), { wrapper: wrapper() });
    expect(itemsApi.getAll).not.toHaveBeenCalled();
    expect(featuredApi.get).not.toHaveBeenCalled();
  });
});
