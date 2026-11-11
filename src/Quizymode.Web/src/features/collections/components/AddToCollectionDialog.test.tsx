import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddToCollectionDialog } from "./AddToCollectionDialog";

const mocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  listChildCollections: vi.fn(),
  addChildCollection: vi.fn(),
}));

vi.mock("@/api/collections", () => ({
  collectionsApi: {
    getAll: mocks.getAll,
    listChildCollections: mocks.listChildCollections,
    addChildCollection: mocks.addChildCollection,
    addItem: vi.fn(),
    addTopic: vi.fn(),
  },
}));
vi.mock("@/api/categories", () => ({ categoriesApi: { getAll: vi.fn().mockResolvedValue({ categories: [] }) } }));
vi.mock("@/api/keywords", () => ({ keywordsApi: { getNavigationKeywords: vi.fn().mockResolvedValue({ keywords: [] }) } }));
vi.mock("@/api/search", () => ({ searchApi: { search: vi.fn().mockResolvedValue({ query: "", groups: {} }) } }));

function renderDialog(props: Partial<React.ComponentProps<typeof AddToCollectionDialog>> = {}) {
  const onClose = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AddToCollectionDialog
        open
        onClose={onClose}
        collectionId="current"
        ancestorIds={[]}
        {...props}
      />
    </QueryClientProvider>
  );
  return { onClose };
}

describe("AddToCollectionDialog", () => {
  beforeEach(() => {
    mocks.getAll.mockReset();
    mocks.listChildCollections.mockReset();
    mocks.addChildCollection.mockReset();
  });

  it("shows the three tabs in order, with Questions selected first", () => {
    renderDialog();

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Questions", "Topics", "Collections"]);
    expect(screen.getByRole("tab", { name: "Questions" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("dialog", { name: "Add to collection" })).toBeInTheDocument();
  });

  it("renders at the body, outside a transformed ancestor, so it is not clipped", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <div style={{ transform: "translateZ(0)" }} data-testid="transformed">
          <AddToCollectionDialog open onClose={vi.fn()} collectionId="current" ancestorIds={[]} />
        </div>
      </QueryClientProvider>
    );

    const dialog = screen.getByRole("dialog", { name: "Add to collection" });
    expect(container.querySelector("[data-testid='transformed']")).not.toContainElement(dialog);
    expect(document.body).toContainElement(dialog);
  });

  it("closes on Escape", async () => {
    const { onClose } = renderDialog();

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables a collection that would form a cycle, with a reason", async () => {
    mocks.getAll.mockResolvedValue({
      collections: [{ id: "parent", name: "Parent" }, { id: "other", name: "Other" }],
    });
    mocks.listChildCollections.mockResolvedValue({ children: [], hiddenCollectionCount: 0 });
    renderDialog({ ancestorIds: ["parent"] });

    await userEvent.click(screen.getByRole("tab", { name: "Collections" }));

    const parentRow = (await screen.findByText("Parent")).closest("li") as HTMLElement;
    expect(within(parentRow).getByRole("button", { name: "Add" })).toBeDisabled();
    expect(within(parentRow).getByText(/would create a cycle/i)).toBeInTheDocument();

    const otherRow = screen.getByText("Other").closest("li") as HTMLElement;
    await waitFor(() => expect(within(otherRow).getByRole("button", { name: "Add" })).toBeEnabled());
  });

  it("disables a collection whose subtree would nest deeper than three levels", async () => {
    mocks.getAll.mockResolvedValue({ collections: [{ id: "deep", name: "Deep" }] });
    // Deep has a chain of three levels (itself, d2, d3): height 3. Under a root (depth 1) that reaches level 4.
    mocks.listChildCollections.mockImplementation(async (id: string) => {
      const next: Record<string, string | null> = { deep: "d2", d2: "d3", d3: null };
      const child = next[id];
      return {
        children: child ? [{ id: child, name: child, isPublic: true, hiddenFromOthers: false, addedAt: "" }] : [],
        hiddenCollectionCount: 0,
      };
    });
    renderDialog({ ancestorIds: ["root"] });

    await userEvent.click(screen.getByRole("tab", { name: "Collections" }));

    const row = (await screen.findByText("Deep")).closest("li") as HTMLElement;
    await waitFor(() => expect(within(row).getByText(/nest deeper than 3 levels/i)).toBeInTheDocument());
    expect(within(row).getByRole("button", { name: "Add" })).toBeDisabled();
  });
});
