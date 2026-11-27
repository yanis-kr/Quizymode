import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import CollectionDetailPage from "./CollectionDetailPage";
import { collectionsApi } from "@/api/collections";
import { refusal } from "@/test/refusal";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock("@/hooks/useCurrentUserId", () => ({ useCurrentUserId: () => "u1" }));
vi.mock("@/hooks/useListenAll", () => ({
  useListenAll: () => ({ listenState: "idle", handleButton: vi.fn(), isSupported: false }),
}));
vi.mock("@/components/ItemListSection", () => ({ default: () => null }));
vi.mock("@/components/ItemCollectionsModal", () => ({ default: () => null }));
vi.mock("@/components/ItemCollectionControls", () => ({ ItemCollectionControls: () => null }));
vi.mock("@/components/ScopeSecondaryBar", () => ({ ScopeSecondaryBar: () => null }));
vi.mock("../components/ShareCollectionButton", () => ({ ShareCollectionButton: () => null }));
vi.mock("../components/AddToCollectionDialog", () => ({ AddToCollectionDialog: () => null }));
vi.mock("../components/ChildCollectionsSection", () => ({ ChildCollectionsSection: () => null }));
vi.mock("../components/TopicMembersSection", () => ({ TopicMembersSection: () => null }));
vi.mock("@/features/studyPlans/PlanForTestButton", () => ({ PlanForTestButton: () => null }));
vi.mock("@/api/collections", () => ({
  collectionsApi: {
    getById: vi.fn(),
    getItems: vi.fn(),
    getRating: vi.fn(),
    getBookmarkedBy: vi.fn(),
    listChildCollections: vi.fn(),
    listTopics: vi.fn(),
    removeItem: vi.fn(),
    update: vi.fn(),
    setRating: vi.fn(),
  },
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/collections/c1"]}>
          <Routes>
            <Route path="/collections/:id" element={<CollectionDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

const descriptionBox = () => screen.findByPlaceholderText("e.g. Biology chapter 5 practice set");

describe("CollectionDetailPage refused saves (AC 17.8)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(collectionsApi.getById).mockResolvedValue({
      id: "c1", name: "Bio Set", description: null, createdBy: "u1",
      createdAt: "2026-01-01T00:00:00Z", itemCount: 0, isPublic: false, isDiscoverable: false,
    } as never);
    vi.mocked(collectionsApi.getItems).mockResolvedValue({ items: [] } as never);
    vi.mocked(collectionsApi.getRating).mockResolvedValue({ count: 0, averageStars: null, myStars: null } as never);
    vi.mocked(collectionsApi.getBookmarkedBy).mockResolvedValue({ bookmarkedBy: [] } as never);
    vi.mocked(collectionsApi.listChildCollections).mockResolvedValue({ collections: [] } as never);
    vi.mocked(collectionsApi.listTopics).mockResolvedValue({ topics: [] } as never);
  });

  it("keeps the typed description and shows the server message under it", async () => {
    vi.mocked(collectionsApi.update).mockRejectedValue(refusal("Too many requests."));
    renderPage();
    const box = await descriptionBox();
    fireEvent.change(box, { target: { value: "Keep me" } });

    fireEvent.blur(box);

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests.");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(box).toHaveValue("Keep me");
    expect(box.parentElement).toContainElement(screen.getByRole("alert"));
  });

  it("shows a refused visibility change under the toggles, not under the description", async () => {
    vi.mocked(collectionsApi.update).mockRejectedValue(refusal("Too many requests."));
    renderPage();
    const box = await descriptionBox();

    fireEvent.click(screen.getByLabelText(/anyone with the link can view/i));

    await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(1));
    expect(box.parentElement).not.toContainElement(screen.getByRole("alert"));
    expect(screen.getByLabelText(/anyone with the link can view/i)).not.toBeChecked();
  });

  it("shows the server message when a rating is refused", async () => {
    vi.mocked(collectionsApi.setRating).mockRejectedValue(refusal("Too many changes in a short time."));
    renderPage();

    fireEvent.click(await screen.findByTitle("Rate 3 stars"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many changes in a short time.");
  });
});
