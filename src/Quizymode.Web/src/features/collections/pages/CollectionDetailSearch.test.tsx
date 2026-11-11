import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CollectionDetailPage from "./CollectionDetailPage";
import { collectionsApi } from "@/api/collections";
import { installMemoryLocalStorage } from "@/test/memoryStorage";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: false }),
}));
vi.mock("@/api/studyPlans", () => ({ studyPlansApi: { list: vi.fn().mockResolvedValue([]), upsert: vi.fn(), remove: vi.fn() } }));
vi.mock("@/hooks/useCurrentUserId", () => ({ useCurrentUserId: () => null }));
vi.mock("@/hooks/useListenAll", () => ({
  useListenAll: () => ({ listenState: "idle", handleButton: vi.fn(), isSupported: false }),
}));
vi.mock("@/components/ItemListSection", () => ({
  default: (props: { items: { id: string; question: string }[] }) => (
    <ul data-testid="item-list">
      {props.items.map((i) => (
        <li key={i.id}>{i.question}</li>
      ))}
    </ul>
  ),
}));
vi.mock("@/components/ItemCollectionsModal", () => ({ default: () => null }));
vi.mock("@/components/ItemCollectionControls", () => ({ ItemCollectionControls: () => null }));
vi.mock("@/components/ScopeSecondaryBar", () => ({ ScopeSecondaryBar: () => null }));
vi.mock("../components/ShareCollectionButton", () => ({ ShareCollectionButton: () => null }));
vi.mock("@/api/collections", () => ({
  collectionsApi: {
    getById: vi.fn(),
    getItems: vi.fn(),
    getRating: vi.fn(),
    getBookmarkedBy: vi.fn(),
    removeItem: vi.fn(),
    update: vi.fn(),
    setRating: vi.fn(),
  },
}));

const makeItem = (id: string, question: string, correctAnswer: string) =>
  ({
    id,
    question,
    correctAnswer,
    incorrectAnswers: ["Wrong"],
    explanation: "",
    collections: [],
    keywords: [],
  }) as never;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/collections/c1"]}>
        <Routes>
          <Route path="/collections/:id" element={<CollectionDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function mockRoster(items: unknown[], totalCount: number) {
  vi.mocked(collectionsApi.getItems).mockResolvedValue({ items, totalCount } as never);
}

describe("CollectionDetailPage in-collection search (#555, AC 1.5.12)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    installMemoryLocalStorage();
    vi.mocked(collectionsApi.getById).mockResolvedValue({
      id: "c1",
      name: "Bio Set",
      description: null,
      createdBy: "someone-else",
      createdAt: "2026-01-01T00:00:00Z",
      itemCount: 3,
      isPublic: true,
      isDiscoverable: false,
    } as never);
    vi.mocked(collectionsApi.getRating).mockResolvedValue({ count: 0, averageStars: null, myStars: null } as never);
    mockRoster(
      [
        makeItem("1", "Cell powerhouse", "Mitochondria"),
        makeItem("2", "Plant pigment", "Chlorophyll"),
        makeItem("3", "Gas we breathe", "Oxygen"),
      ],
      3
    );
  });

  it("filters the loaded roster by question or answer text", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();
    await screen.findByTestId("item-list");

    await user.type(screen.getByRole("searchbox"), "chloro");
    expect(screen.getByText("Plant pigment")).toBeInTheDocument();
    expect(screen.queryByText("Cell powerhouse")).not.toBeInTheDocument();
    expect(screen.queryByText("Gas we breathe")).not.toBeInTheDocument();
  });

  it("shows a no-match state when nothing matches and keeps the header count unfiltered", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();
    await screen.findByTestId("item-list");

    await user.type(screen.getByRole("searchbox"), "zebra");
    expect(screen.getByText(/No questions match/)).toHaveTextContent("zebra");
    expect(screen.queryByTestId("item-list")).not.toBeInTheDocument();
    expect(screen.getByText("3 items")).toBeInTheDocument();
  });

  it("returns to page one when the search term changes", async () => {
    // Pagination resets to page 1 whenever the term changes; a single-page roster stays on page 1.
    const user = userEvent.setup({ delay: null });
    renderPage();
    await screen.findByTestId("item-list");

    const input = screen.getByRole("searchbox");
    await user.type(input, "o");
    await user.clear(input);
    await waitFor(() => expect(screen.getByText("Cell powerhouse")).toBeInTheDocument());
    expect(screen.getByText("Gas we breathe")).toBeInTheDocument();
  });

  it("notes when the search covers only the loaded part of a larger roster", async () => {
    mockRoster([makeItem("1", "Cell powerhouse", "Mitochondria")], 1200);
    renderPage();
    await screen.findByTestId("item-list");

    expect(screen.getByText("Search covers the first 1 of 1200 questions.")).toBeInTheDocument();
  });

  it("omits the truncation notice when the whole roster is loaded", async () => {
    renderPage();
    await screen.findByTestId("item-list");

    expect(screen.queryByText(/Search covers the first/)).not.toBeInTheDocument();
  });
});
