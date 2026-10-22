import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ItemCollectionsModal from "./ItemCollectionsModal";
import UserProfileModal from "./UserProfileModal";

const auth = vi.hoisted(() => ({ isAuthenticated: true }));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("@/api/collections", () => ({
  collectionsApi: { getAll: vi.fn().mockResolvedValue({ collections: [] }) },
}));
vi.mock("@/api/items", () => ({ itemsApi: { getById: vi.fn().mockResolvedValue({ id: "i", collections: [] }) } }));
vi.mock("@/api/users", () => ({
  usersApi: { getCurrent: vi.fn().mockResolvedValue({ id: "u", name: "Ann", email: "a@b.c", isAdmin: false }) },
}));
vi.mock("@/hooks/useActiveCollection", () => ({
  useActiveCollection: () => ({ activeCollectionId: null, setActiveCollectionId: vi.fn() }),
}));
vi.mock("@/hooks/usePageSize", () => ({
  usePageSize: () => ({ pageSize: 20, updatePageSize: vi.fn(), isUpdating: false }),
  PAGE_SIZE_OPTIONS: [20, 50],
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("modal dialog semantics (AC 3.16.8)", () => {
  beforeEach(() => {
    auth.isAuthenticated = true;
  });

  it("ItemCollectionsModal is a labelled modal dialog", () => {
    renderWithClient(<ItemCollectionsModal isOpen onClose={() => {}} itemId="i" />);
    const dialog = screen.getByRole("dialog", { name: "Manage Collections" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("UserProfileModal is a modal dialog with an accessible name for guests", () => {
    auth.isAuthenticated = false;
    renderWithClient(<UserProfileModal isOpen onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "User Profile" })).toHaveAttribute("aria-modal", "true");
  });

  it("UserProfileModal is a modal dialog with an accessible name for signed-in users", async () => {
    renderWithClient(<UserProfileModal isOpen onClose={() => {}} />);
    const dialog = await screen.findByRole("dialog", { name: "User Profile" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });
});
