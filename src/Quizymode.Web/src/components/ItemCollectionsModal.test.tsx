import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ItemCollectionsModal from "./ItemCollectionsModal";
import { collectionsApi } from "@/api/collections";
import { itemsApi } from "@/api/items";
import { refusal } from "@/test/refusal";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock("@/hooks/useActiveCollection", () => ({
  useActiveCollection: () => ({ activeCollectionId: null, setActiveCollectionId: vi.fn() }),
}));
vi.mock("@/api/collections", () => ({
  collectionsApi: { getAll: vi.fn(), create: vi.fn(), addItem: vi.fn(), removeItem: vi.fn(), bulkAddItems: vi.fn() },
}));
vi.mock("@/api/items", () => ({ itemsApi: { getById: vi.fn() } }));

describe("ItemCollectionsModal refused create (AC 17.8)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(collectionsApi.getAll).mockResolvedValue({ collections: [] } as never);
    vi.mocked(itemsApi.getById).mockResolvedValue({ collections: [] } as never);
    vi.mocked(collectionsApi.create).mockRejectedValue(refusal("Daily collection limit reached."));
  });

  it("shows the server message, keeps the name and clears the message after closing", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const modal = (isOpen: boolean) => (
      <QueryClientProvider client={queryClient}>
        <ItemCollectionsModal isOpen={isOpen} onClose={() => {}} itemId="item-1" />
      </QueryClientProvider>
    );
    const user = userEvent.setup({ delay: null });
    const view = render(modal(true));
    const input = await screen.findByPlaceholderText("Enter collection name");

    await user.type(input, "Keep me{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("Daily collection limit reached.");
    expect(input).toHaveValue("Keep me");
    expect(collectionsApi.create).toHaveBeenCalledTimes(1);
    expect(collectionsApi.addItem).not.toHaveBeenCalled();

    view.rerender(modal(false));
    view.rerender(modal(true));
    await screen.findByPlaceholderText("Enter collection name");
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
