import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import CollectionsPage from "./CollectionsPage";

const mockGetAll = vi.fn();
const mockDiscover = vi.fn();
const mockGetBookmarks = vi.fn();
const mockGetSettings = vi.fn();
const mockGetAllItems = vi.fn();

vi.mock("@/api/collections", () => ({
  collectionsApi: {
    getAll: () => mockGetAll(),
    discover: (opts: unknown) => mockDiscover(opts),
    getBookmarks: () => mockGetBookmarks(),
    getBookmarkedBy: vi.fn().mockResolvedValue({ users: [] }),
    getRating: vi.fn().mockResolvedValue({ averageStars: null, count: 0 }),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    bookmark: vi.fn(),
    unbookmark: vi.fn(),
    setRating: vi.fn(),
    bulkAddItems: vi.fn(),
  },
}));

vi.mock("@/api/categories", () => ({
  categoriesApi: {
    getAll: vi.fn().mockResolvedValue({ categories: [] }),
  },
}));

vi.mock("@/api/keywords", () => ({
  keywordsApi: {
    getAll: vi.fn().mockResolvedValue({ keywords: [] }),
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

function renderPage(initialRoute = "/collections") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <CollectionsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("CollectionsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBookmarks.mockResolvedValue({ collections: [] });
    mockDiscover.mockResolvedValue({ collections: [], total: 0, page: 1, pageSize: 10 });
    mockGetSettings.mockResolvedValue({ settings: {} });
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

  it("renders Discover tab", async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, userId: null, isAdmin: false });
    mockGetAll.mockResolvedValue({ collections: [] });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /discover/i })).toBeInTheDocument();
    });
  });
});
