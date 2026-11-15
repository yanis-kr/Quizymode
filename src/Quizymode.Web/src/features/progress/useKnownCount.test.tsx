import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import { SetProgress } from "@/components/ScopeLandingHeader";
import { categorySetKey, collectionSetKey } from "./knownItems";
import { useKnownCount } from "./useKnownCount";

const { mockGetSetProgress, authState } = vi.hoisted(() => ({
  mockGetSetProgress: vi.fn(),
  authState: { isAuthenticated: true, isLoading: false },
}));
vi.mock("@/api/studySessions", () => ({
  MAX_SET_PROGRESS_SCOPES: 12,
  studySessionsApi: { getSetProgress: mockGetSetProgress },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => authState }));

function Tile({ setKey, total }: { setKey: string; total: number }) {
  const known = useKnownCount(setKey);
  return known === null || known <= 0 ? <p>none</p> : <SetProgress known={known} total={total} />;
}

function renderTiles(tiles: { setKey: string; total: number }[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      {tiles.map((t) => (
        <Tile key={t.setKey} {...t} />
      ))}
    </QueryClientProvider>,
  );
}

describe("useKnownCount for signed-in users (#685)", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    authState.isAuthenticated = true;
    authState.isLoading = false;
    mockGetSetProgress.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows 'N of M known' from the account", async () => {
    const key = categorySetKey("trivia", ["brain-teasers"]);
    mockGetSetProgress.mockResolvedValue({ scopes: [{ scope: key, knownCount: 4 }] });
    renderTiles([{ setKey: key, total: 10 }]);
    expect(await screen.findByText("4 of 10 known")).toBeInTheDocument();
    expect(mockGetSetProgress).toHaveBeenCalledWith([key]);
  });

  it("shows the completed state when every item is known", async () => {
    const key = collectionSetKey("AAAAAAAA-1111-4111-8111-111111111111");
    mockGetSetProgress.mockResolvedValue({ scopes: [{ scope: key, knownCount: 7 }] });
    renderTiles([{ setKey: key, total: 7 }]);
    expect(await screen.findByText("Completed: all 7 known")).toBeInTheDocument();
  });

  it("batches several tiles into one request", async () => {
    const a = categorySetKey("trivia", []);
    const b = categorySetKey("science", []);
    mockGetSetProgress.mockResolvedValue({
      scopes: [
        { scope: a, knownCount: 1 },
        { scope: b, knownCount: 2 },
      ],
    });
    renderTiles([
      { setKey: a, total: 5 },
      { setKey: b, total: 5 },
    ]);
    expect(await screen.findByText("2 of 5 known")).toBeInTheDocument();
    expect(await screen.findByText("1 of 5 known")).toBeInTheDocument();
    expect(mockGetSetProgress).toHaveBeenCalledTimes(1);
    expect(mockGetSetProgress.mock.calls[0][0]).toEqual([a, b]);
  });

  it("shows nothing when the request fails or nothing is known", async () => {
    const key = categorySetKey("trivia", []);
    mockGetSetProgress.mockRejectedValue(new Error("boom"));
    renderTiles([{ setKey: key, total: 5 }]);
    await waitFor(() => expect(mockGetSetProgress).toHaveBeenCalled());
    expect(screen.getByText("none")).toBeInTheDocument();
  });

  it("does not call the account endpoint for guests", () => {
    authState.isAuthenticated = false;
    renderTiles([{ setKey: categorySetKey("trivia", []), total: 5 }]);
    expect(mockGetSetProgress).not.toHaveBeenCalled();
    expect(screen.getByText("none")).toBeInTheDocument();
  });
});
