import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { addLocalBookmark } from "@/features/collections/localBookmarks";
import CollectionsPage from "./CollectionsPage";

const mockGetAll = vi.fn();
const mockDiscover = vi.fn();
const mockGetBookmarks = vi.fn();
const mockGetSettings = vi.fn();
const mockGetAllItems = vi.fn();
const mockUpdate = vi.fn();
const mockGetById = vi.fn();
const mockGetRating = vi.fn();
const mockGetCategories = vi.fn();
const mockGetNavigationKeywords = vi.fn();

vi.mock("@/api/collections", () => ({
  collectionsApi: {
    getAll: () => mockGetAll(),
    discover: (opts: unknown) => mockDiscover(opts),
    getBookmarks: () => mockGetBookmarks(),
    getBookmarkedBy: vi.fn().mockResolvedValue({ users: [] }),
    getById: (id: string) => mockGetById(id),
    getRating: (id: string) => mockGetRating(id),
    create: vi.fn(),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: vi.fn(),
    bookmark: vi.fn(),
    unbookmark: vi.fn(),
    setRating: vi.fn(),
    bulkAddItems: vi.fn(),
  },
}));

vi.mock("@/api/categories", () => ({
  categoriesApi: {
    getAll: () => mockGetCategories(),
  },
}));

vi.mock("@/api/keywords", () => ({
  keywordsApi: {
    getAll: vi.fn().mockResolvedValue({ keywords: [] }),
    getNavigationKeywords: (category: string, selected: string[]) => mockGetNavigationKeywords(category, selected),
  },
}));

vi.mock("@/api/items", () => ({
  itemsApi: {
    getAll: (...args: unknown[]) => mockGetAllItems(...args),
  },
}));

vi.mock("@/api/users", () => ({
  usersApi: {
    getSettings: () => mockGetSettings(),
    updateSetting: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/hooks/useActiveCollection", () => ({
  useActiveCollection: () => ({
    activeCollectionId: null,
    activeCollection: null,
    setActiveCollectionId: vi.fn(),
    isUpdating: false,
    collections: [],
  }),
}));

vi.mock("@/components/LoadingSpinner", () => ({ default: () => <div>Loading...</div> }));
vi.mock("@/components/ErrorMessage", () => ({
  default: ({ message }: { message: string }) => <div>{message}</div>,
}));
vi.mock("@/components/SEO", () => ({ SEO: () => null }));

const mockUseAuth = vi.fn();

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

function renderPage(initialRoute = "/collections") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <CollectionsPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...view, queryClient };
}

describe("CollectionsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBookmarks.mockResolvedValue({ collections: [] });
    mockDiscover.mockResolvedValue({ collections: [], total: 0, page: 1, pageSize: 10 });
    mockGetSettings.mockResolvedValue({ settings: {} });
    mockGetRating.mockResolvedValue({ averageStars: null, count: 0, myStars: null });
    mockGetCategories.mockResolvedValue({ categories: [] });
    mockGetNavigationKeywords.mockResolvedValue({ keywords: [] });
  });

  it("renders the page with My Collections tab active by default for authenticated users", async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, userId: "u1", isAdmin: false });
    mockGetAll.mockResolvedValue({ collections: [] });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^mine$/i })).toBeInTheDocument();
    });
  });

  it("shows empty state message when user has no collections", async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, userId: "u1", isAdmin: false });
    mockGetAll.mockResolvedValue({ collections: [] });

    renderPage();

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });
  });

  it("shows collections when user has some", async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, userId: "u1", isAdmin: false });
    mockGetAll.mockResolvedValue({
      collections: [
        {
          id: "c1", name: "My AWS Collection", description: "AWS study",
          isPublic: false, itemCount: 5, createdBy: "u1", createdAt: "2024-01-01T00:00:00Z"
        },
      ],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("My AWS Collection")).toBeInTheDocument();
    });
  });

  it("edits link access and Discover listing together in the edit modal", async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, userId: "u1", isAdmin: false });
    mockUpdate.mockResolvedValue({});
    mockGetAll.mockResolvedValue({
      collections: [
        {
          id: "c1", name: "Shared Set", description: null, isPublic: true, isDiscoverable: true,
          itemCount: 2, createdBy: "u1", createdAt: "2024-01-01T00:00:00Z",
        },
      ],
    });

    renderPage();

    fireEvent.click(await screen.findByTitle("Edit collection"));
    const linkAccess = screen.getByLabelText(/anyone with the link can view/i);
    const discover = screen.getByLabelText(/list in discover/i);
    expect(linkAccess).toBeChecked();
    expect(discover).toBeChecked();

    fireEvent.click(linkAccess);
    expect(discover).not.toBeChecked();
    expect(discover).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /^save/i }));
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith("c1", {
        name: "Shared Set",
        description: null,
        isPublic: false,
        isDiscoverable: false,
      })
    );
  });

  it("renders Discover tab", async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, userId: null, isAdmin: false });
    mockGetAll.mockResolvedValue({ collections: [] });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /discover/i })).toBeInTheDocument();
    });
  });

  it("lets a guest bookmark a public collection in this browser and see it under Bookmarked (AC 1.15.2, 1.15.3)", async () => {
    window.localStorage.clear();
    mockUseAuth.mockReturnValue({ isAuthenticated: false, userId: null, isAdmin: false });
    mockGetAll.mockResolvedValue({ collections: [] });
    const publicId = "00000000-0000-4000-8000-00000000000d";
    mockDiscover.mockResolvedValue({
      items: [{ id: publicId, name: "Public Set", itemCount: 4, createdBy: "someone", createdAt: "2024-01-01T00:00:00Z", isBookmarked: false, averageStars: null, ratingCount: 0 }],
      total: 1, page: 1, pageSize: 10,
    });
    mockGetById.mockResolvedValue({ id: publicId, name: "Public Set", itemCount: 4, createdBy: "someone", createdAt: "2024-01-01T00:00:00Z" });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /^discover$/i }));
    fireEvent.click(await screen.findByTitle("Bookmark collection"));
    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem("quizymode.bookmarks.v1") ?? "{}").collections).toEqual([publicId]);
    });

    const bookmarkedTab = screen.getByRole("button", { name: /^bookmarked$/i });
    expect(bookmarkedTab).toBeEnabled();
    fireEvent.click(bookmarkedTab);
    expect(await screen.findByText("Public Set")).toBeInTheDocument();
    expect(mockGetById).toHaveBeenCalledWith(publicId);
    expect(mockGetBookmarks).not.toHaveBeenCalled();
  });
});

describe("CollectionsPage Discover (#899)", () => {
  const collectionId = "00000000-0000-4000-8000-00000000000d";
  const ownerId = "9b1c7f2e-0000-4000-8000-0000000000aa";
  const card = {
    id: collectionId,
    name: "Public Set",
    itemCount: 4,
    createdBy: ownerId,
    createdAt: "2024-01-01T00:00:00Z",
    isBookmarked: false,
  };
  const filterLabels = ["Category", "Topic", "Subtopic", "Item tags"];

  const signedOut = () => mockUseAuth.mockReturnValue({ isAuthenticated: false, userId: null, isAdmin: false });
  const signedIn = () => mockUseAuth.mockReturnValue({ isAuthenticated: true, userId: "u1", isAdmin: false });
  const filtersButton = () => screen.getByRole("button", { name: /^filters( \(\d+\))?$/i });
  const searchField = () => screen.getByPlaceholderText("Search public collections...");
  const lastDiscoverCall = () => mockDiscover.mock.calls[mockDiscover.mock.calls.length - 1][0];
  const change = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  const ratingStatus = (queryClient: QueryClient) =>
    queryClient.getQueryState(["collectionRating", collectionId])?.status;

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    mockGetAll.mockResolvedValue({ collections: [] });
    mockGetBookmarks.mockResolvedValue({ collections: [card] });
    mockGetById.mockResolvedValue(card);
    mockDiscover.mockResolvedValue({ items: [card], totalCount: 1 });
    mockGetSettings.mockResolvedValue({ settings: {} });
    mockGetRating.mockResolvedValue({ averageStars: null, count: 0, myStars: null });
    mockGetCategories.mockResolvedValue({ categories: [{ category: "science" }] });
    mockGetNavigationKeywords.mockImplementation((_category: string, selected: string[]) =>
      Promise.resolve({ keywords: [{ name: selected.length === 0 ? "physics" : "optics", itemCount: 1 }] }),
    );
  });

  it("AC 1.3.11 offers no empty topic or subtopic in the Discover filters", async () => {
    signedOut();
    mockGetNavigationKeywords.mockImplementation((_category: string, selected: string[]) =>
      Promise.resolve({
        keywords:
          selected.length === 0
            ? [{ name: "physics", itemCount: 2 }, { name: "general", itemCount: 0 }]
            : [{ name: "optics", itemCount: 2 }, { name: "misc", itemCount: 0 }],
      }),
    );
    renderPage("/collections?tab=discover");
    await screen.findByText("Public Set");
    fireEvent.click(filtersButton());
    await screen.findByRole("option", { name: "Science" });
    change("Category", "science");

    await screen.findByRole("option", { name: "physics" });
    expect(screen.queryByRole("option", { name: "general" })).not.toBeInTheDocument();
    change("Topic", "physics");

    await screen.findByRole("option", { name: "optics" });
    expect(screen.queryByRole("option", { name: "misc" })).not.toBeInTheDocument();
  });

  it("AC 1.3.11 keeps a selected topic listed when its count drops to 0", async () => {
    signedOut();
    let physicsCount = 2;
    mockGetNavigationKeywords.mockImplementation(() =>
      Promise.resolve({ keywords: [{ name: "physics", itemCount: physicsCount }] }),
    );
    const { queryClient } = renderPage("/collections?tab=discover");
    await screen.findByText("Public Set");
    fireEvent.click(filtersButton());
    await screen.findByRole("option", { name: "Science" });
    change("Category", "science");
    await screen.findByRole("option", { name: "physics" });
    change("Topic", "physics");

    physicsCount = 0;
    await act(() => queryClient.refetchQueries({ queryKey: ["keywords"] }));

    expect(screen.getByLabelText("Topic")).toHaveValue("physics");
  });

  it("keeps search visible and hides the filters and Open by ID until Filters is opened", async () => {
    signedOut();
    renderPage("/collections?tab=discover");
    await screen.findByText("Public Set");

    expect(searchField()).toBeVisible();
    const toggle = filtersButton();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent(/^Filters$/);
    for (const label of filterLabels) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open by ID" })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/collection id/i)).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(toggle.getAttribute("aria-controls") ?? "")).toBeInTheDocument();
    for (const label of filterLabels) {
      expect(screen.getByLabelText(label)).toBeVisible();
    }
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Open by ID" })).toBeVisible();
    expect(screen.getByPlaceholderText(/collection id/i)).toBeVisible();
  });

  it("applies each filter, keeps values when closed, counts only the four filters and clears them but not the search", async () => {
    signedOut();
    renderPage("/collections?tab=discover");
    await screen.findByText("Public Set");

    fireEvent.change(searchField(), { target: { value: "set" } });
    fireEvent.click(filtersButton());
    fireEvent.change(screen.getByPlaceholderText(/collection id/i), { target: { value: collectionId } });
    expect(filtersButton()).toHaveTextContent(/^Filters$/);

    // Display name on the option, stored name as its value and in the request (#902).
    expect(await screen.findByRole("option", { name: "Science" })).toHaveValue("science");
    change("Category", "science");
    change("Item tags", "s3");
    expect(filtersButton()).toHaveTextContent("Filters (2)");
    await waitFor(() => expect(lastDiscoverCall()).toMatchObject({ category: "science", tags: "s3", q: "set" }));

    await screen.findByRole("option", { name: "physics" });
    change("Topic", "physics");
    await waitFor(() => expect(lastDiscoverCall()).toMatchObject({ keywords: "physics" }));
    await screen.findByRole("option", { name: "optics" });
    change("Subtopic", "optics");
    expect(filtersButton()).toHaveTextContent("Filters (4)");
    const applied = { category: "science", keywords: "physics,optics", tags: "s3", q: "set" };
    await waitFor(() => expect(lastDiscoverCall()).toMatchObject(applied));

    fireEvent.click(filtersButton());
    expect(filtersButton()).toHaveAttribute("aria-expanded", "false");
    expect(filtersButton()).toHaveTextContent("Filters (4)");
    expect(screen.queryByLabelText("Category")).not.toBeInTheDocument();
    expect(lastDiscoverCall()).toMatchObject(applied);

    fireEvent.click(filtersButton());
    expect(screen.getByLabelText("Category")).toHaveValue("science");
    expect(screen.getByLabelText("Topic")).toHaveValue("physics");
    expect(screen.getByLabelText("Subtopic")).toHaveValue("optics");
    expect(screen.getByLabelText("Item tags")).toHaveValue("s3");
    expect(screen.getByPlaceholderText(/collection id/i)).toHaveValue(collectionId);

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(filtersButton()).toHaveTextContent(/^Filters$/);
    for (const label of filterLabels) {
      expect(screen.getByLabelText(label)).toHaveValue("");
    }
    expect(searchField()).toHaveValue("set");
    await waitFor(() =>
      expect(lastDiscoverCall()).toEqual({
        q: "set",
        page: 1,
        pageSize: 12,
        category: undefined,
        keywords: undefined,
        tags: undefined,
      }),
    );
  });

  it.each(["button", "Enter key"])("opens a collection by ID from the panel with the %s", async (how) => {
    signedOut();
    renderPage("/collections?tab=discover");
    await screen.findByText("Public Set");

    fireEvent.click(filtersButton());
    const input = screen.getByPlaceholderText(/collection id/i);
    fireEvent.change(input, { target: { value: ` ${collectionId} ` } });
    if (how === "button") fireEvent.click(screen.getByRole("button", { name: "Open by ID" }));
    else fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByTestId("location")).toHaveTextContent(`/collections/${collectionId}`);
  });

  it("rejects a collection ID that is not a GUID", async () => {
    signedOut();
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    renderPage("/collections?tab=discover");
    await screen.findByText("Public Set");

    fireEvent.click(filtersButton());
    fireEvent.change(screen.getByPlaceholderText(/collection id/i), { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: "Open by ID" }));

    expect(alert).toHaveBeenCalledWith("Please enter a valid collection ID (GUID format).");
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/collections$/);
    alert.mockRestore();
  });

  it.each([
    ["signed out", signedOut],
    ["signed in", signedIn],
  ])("uses no L1 or L2 labels when %s", async (_name, auth) => {
    auth();
    const { container } = renderPage("/collections?tab=discover");
    await screen.findByText("Public Set");
    fireEvent.click(filtersButton());

    expect(screen.getByLabelText("Topic")).toBeInTheDocument();
    expect(screen.getByLabelText("Subtopic")).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/\bL[12]\b/);
  });

  it("shows only the count in the result line to signed-out visitors", async () => {
    signedOut();
    mockDiscover.mockResolvedValue({ items: [card], totalCount: 19 });
    renderPage("/collections?tab=discover");

    expect(await screen.findByText("19 public collections found.")).toBeInTheDocument();
    expect(screen.queryByText(/make your collection public/i)).not.toBeInTheDocument();
  });

  it("keeps the make-it-public sentence in the result line when signed in", async () => {
    signedIn();
    mockDiscover.mockResolvedValue({ items: [card], totalCount: 19 });
    renderPage("/collections?tab=discover");

    expect(
      await screen.findByText("19 public collections found. Make your collection public in its settings to appear here."),
    ).toBeInTheDocument();
  });

  it.each([
    ["discover", "signed out", signedOut],
    ["discover", "signed in", signedIn],
    ["bookmarked", "signed out", signedOut],
    ["bookmarked", "signed in", signedIn],
  ])("shows no By line on %s cards when %s", async (tab, _name, auth) => {
    auth();
    addLocalBookmark(collectionId);
    renderPage(`/collections?tab=${tab}`);

    await screen.findByText("Public Set");
    expect(screen.queryByText(/^By /)).not.toBeInTheDocument();
    expect(screen.queryByText(new RegExp(ownerId))).not.toBeInTheDocument();
  });

  it.each([
    ["has no ratings", () => Promise.resolve({ averageStars: null, count: 0, myStars: null }), "success"],
    ["is still loading", () => new Promise(() => {}), "pending"],
    ["failed to load", () => Promise.reject(new Error("boom")), "error"],
  ])("shows no rating row to signed-out visitors when the rating %s", async (_name, rating, status) => {
    signedOut();
    mockGetRating.mockImplementation(rating);
    const { queryClient } = renderPage("/collections?tab=discover");

    await screen.findByText("Public Set");
    await waitFor(() => expect(ratingStatus(queryClient)).toBe(status));
    await act(async () => {});
    expect(screen.queryByText("Rating")).not.toBeInTheDocument();
    expect(screen.queryByText("No ratings yet")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Sign in to rate this collection.")).not.toBeInTheDocument();
  });

  it.each(["discover", "bookmarked"])("shows read-only stars to signed-out visitors on %s cards with ratings", async (tab) => {
    signedOut();
    addLocalBookmark(collectionId);
    mockGetRating.mockResolvedValue({ averageStars: 4.5, count: 2, myStars: null });
    renderPage(`/collections?tab=${tab}`);

    expect(await screen.findByText("4.5 (2)")).toBeInTheDocument();
    expect(screen.getByText("Rating")).toBeInTheDocument();
    expect(screen.getAllByTitle("Sign in to rate this collection.")).toHaveLength(5);
    expect(screen.queryByTitle(/^Rate \d star/)).not.toBeInTheDocument();
  });

  it.each(["discover", "bookmarked"])("keeps the rating buttons and No ratings yet on signed-in %s cards", async (tab) => {
    signedIn();
    renderPage(`/collections?tab=${tab}`);

    expect(await screen.findByText("No ratings yet")).toBeInTheDocument();
    expect(screen.getAllByTitle(/^Rate \d star/)).toHaveLength(5);
  });

  it("shows the short intro to signed-out visitors", async () => {
    signedOut();
    renderPage("/collections?tab=discover");

    expect(await screen.findByText("Browse public collections. Sign in to manage your own.")).toBeInTheDocument();
  });
});
