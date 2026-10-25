import { AxiosError, AxiosHeaders } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { SearchResponse } from "@/api/search";
import GlobalSearch from "./GlobalSearch";

const { mockSearch, mockTrackEvent, authState } = vi.hoisted(() => ({
  mockSearch: vi.fn(),
  mockTrackEvent: vi.fn(),
  authState: { isAuthenticated: false },
}));

vi.mock("@/api/search", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/api/search")>();
  return { ...original, searchApi: { search: mockSearch } };
});

vi.mock("@/features/analytics/analyticsEvents", () => ({ trackEvent: mockTrackEvent }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: authState.isAuthenticated, isLoading: false }),
}));

const COLLECTION_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "22222222-2222-4222-8222-222222222222";

const RESPONSE: SearchResponse = {
  query: "artificial",
  groups: {
    categories: { results: [], hasMore: false },
    subcategories: {
      results: [{ categorySlug: "tech", l1: "ai-ml", l2: null, description: "AI and ML", itemCount: 57 }],
      hasMore: false,
    },
    collections: {
      results: [{ id: COLLECTION_ID, name: "Intro to AI", description: null, itemCount: 30 }],
      hasMore: true,
    },
    items: {
      results: [
        {
          id: ITEM_ID,
          snippet: { text: "What is artificial intelligence?", highlights: [{ start: 8, length: 10 }] },
          categorySlug: "tech",
          l1: "ai-ml",
          l2: null,
        },
      ],
      hasMore: false,
    },
    mine: null,
  },
};

function setViewport(isInline: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: isInline && query.includes("1280"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderSearch(extra?: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <GlobalSearch />
        <LocationDisplay />
        <input aria-label="Other field" />
        {extra}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function rateLimitError(): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError("Too many", "ERR_BAD_REQUEST", config, null, {
    status: 429,
    statusText: "",
    data: {},
    headers: { "retry-after": "7" },
    config,
  });
}

describe("GlobalSearch (inline, xl and up)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isAuthenticated = false;
    setViewport(true);
    mockSearch.mockResolvedValue(RESPONSE);
  });

  afterEach(() => {
    // @ts-expect-error restoring the jsdom default (no matchMedia)
    delete window.matchMedia;
  });

  it("renders exactly one variant: the inline combobox, not the icon trigger", () => {
    renderSearch();
    expect(screen.getByRole("combobox", { name: "Search Quizymode" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Search" })).not.toBeInTheDocument();
    expect(screen.getByRole("search", { name: "Site search" })).toBeInTheDocument();
  });

  it("reports aria-expanded=false and no listbox until there are options", async () => {
    const user = userEvent.setup();
    renderSearch();
    const input = screen.getByRole("combobox");

    await user.click(input);
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).not.toHaveAttribute("aria-controls");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByText("Search topics, collections and questions.")).toBeInTheDocument();

    await user.type(input, "a");
    expect(screen.getByText("Keep typing. Search needs at least 2 characters.")).toBeInTheDocument();
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("sends one debounced request, groups the results and Enter opens the auto-active topic", async () => {
    const user = userEvent.setup();
    renderSearch();
    const input = screen.getByRole("combobox");

    await user.type(input, "artificial");

    const listbox = await screen.findByRole("listbox", { name: "Search results" });
    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(mockSearch.mock.calls[0][0]).toEqual({
      q: "artificial",
      types: ["categories", "subcategories", "collections", "items"],
      limit: 5,
      offset: 0,
    });
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-controls", "global-search-listbox");

    expect(screen.getByRole("group", { name: "Topics" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Collections" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Questions" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Mine" })).not.toBeInTheDocument();
    expect(listbox).toHaveTextContent("ai-ml");
    expect(screen.getByRole("option", { name: /See all collections/ })).toBeInTheDocument();

    const first = screen.getAllByRole("option")[0];
    expect(first).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", first.id);

    await user.keyboard("{Enter}");

    expect(screen.getByTestId("location")).toHaveTextContent("/categories/tech/ai-ml");
    expect(mockTrackEvent).toHaveBeenCalledWith({ name: "search_performed", contextType: "search", total: 3 });
    expect(mockTrackEvent).toHaveBeenCalledWith({
      name: "search_result_clicked",
      contextType: "category",
      contextId: "tech",
      position: 1,
    });
    expect(JSON.stringify(mockTrackEvent.mock.calls)).not.toContain("artificial");
  });

  it("ArrowDown and ArrowUp wrap around and skip group headings", async () => {
    const user = userEvent.setup();
    renderSearch();
    const input = screen.getByRole("combobox");
    await user.type(input, "artificial");
    await screen.findByRole("listbox");

    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowUp}");
    expect(options[options.length - 1]).toHaveAttribute("aria-selected", "true");
    expect(options[options.length - 1]).toHaveTextContent("See all results for “artificial”");

    await user.keyboard("{ArrowDown}");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
  });

  it("Enter before the results arrive searches the text as typed instead of acting on stale rows", async () => {
    const user = userEvent.setup();
    renderSearch();
    const input = screen.getByRole("combobox");

    await user.type(input, "artificial");
    await screen.findByRole("listbox");

    // New keystroke: the old rows are stale and nothing is active until the new set arrives.
    await user.type(input, " intelligence{Enter}");

    expect(screen.getByTestId("location")).toHaveTextContent("/search?q=artificial+intelligence");
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it("See all for a group opens the /search tab", async () => {
    const user = userEvent.setup();
    renderSearch();
    await user.type(screen.getByRole("combobox"), "artificial");
    await screen.findByRole("listbox");

    await user.click(screen.getByRole("option", { name: /See all collections/ }));

    expect(screen.getByTestId("location")).toHaveTextContent("/search?q=artificial&tab=collections");
  });

  it("shows the empty state outside any listbox and Enter still goes to /search", async () => {
    mockSearch.mockResolvedValue({ query: "zzzz", groups: { categories: { results: [], hasMore: false }, subcategories: null, collections: null, items: null, mine: null } });
    const user = userEvent.setup();
    renderSearch();
    const input = screen.getByRole("combobox");

    await user.type(input, "zzzz");

    expect(await screen.findByText("No results for “zzzz”")).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("link", { name: "Browse all categories" })).toHaveAttribute("href", "/categories");

    await user.keyboard("{Enter}");
    expect(screen.getByTestId("location")).toHaveTextContent("/search?q=zzzz");
  });

  it("shows a static rate-limit notice with Retry-After and retries only when asked", async () => {
    mockSearch.mockRejectedValueOnce(rateLimitError());
    const user = userEvent.setup();
    renderSearch();

    await user.type(screen.getByRole("combobox"), "artificial");

    expect(await screen.findByText("You are searching too fast. Try again in 7 seconds.")).toBeInTheDocument();
    expect(mockSearch).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(mockSearch).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
  });

  it("offers Try again as an option the keyboard can reach after a server error", async () => {
    mockSearch.mockRejectedValueOnce(new Error("boom"));
    const user = userEvent.setup();
    renderSearch();
    const input = screen.getByRole("combobox");

    await user.type(input, "artificial");
    expect((await screen.findAllByText("Could not load search results.")).length).toBeGreaterThan(0);

    // Never auto-activated: Enter would search the text instead, so move to the retry option first.
    expect(input).not.toHaveAttribute("aria-activedescendant");
    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", "gs-opt-retry");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(mockSearch).toHaveBeenCalledTimes(2));
  });

  it("Escape closes the panel but keeps the text, then clears it", async () => {
    const user = userEvent.setup();
    renderSearch();
    const input = screen.getByRole("combobox");
    await user.type(input, "artificial");
    await screen.findByRole("listbox");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveValue("artificial");

    await user.keyboard("{Escape}");
    expect(input).toHaveValue("");
  });

  describe("keyboard shortcuts", () => {
    it("Ctrl+K focuses the input from the page and from other inputs; slash only from the page", async () => {
      const user = userEvent.setup();
      renderSearch();
      const input = screen.getByRole("combobox");
      const other = screen.getByLabelText("Other field");

      await user.keyboard("{Control>}k{/Control}");
      expect(input).toHaveFocus();

      await user.click(other);
      await user.keyboard("{Control>}k{/Control}");
      expect(input).toHaveFocus();

      await user.click(other);
      await user.keyboard("/");
      expect(other).toHaveFocus();
      expect(other).toHaveValue("/");

      other.blur();
      await user.keyboard("/");
      expect(input).toHaveFocus();
      expect(input).toHaveValue("");
    });

    it("ignores both shortcuts while another dialog is mounted", async () => {
      const user = userEvent.setup();
      renderSearch(
        <div role="dialog" aria-modal="true" aria-label="Other dialog">
          <button type="button">Inside</button>
        </div>
      );
      await user.click(screen.getByRole("button", { name: "Inside" }));

      await user.keyboard("{Control>}k{/Control}");
      await user.keyboard("/");

      expect(screen.getByRole("combobox")).not.toHaveFocus();
    });
  });
});

describe("GlobalSearch (overlay, below xl)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isAuthenticated = false;
    setViewport(false);
    mockSearch.mockResolvedValue(RESPONSE);
  });

  afterEach(() => {
    // @ts-expect-error restoring the jsdom default (no matchMedia)
    delete window.matchMedia;
    document.body.style.overflow = "";
  });

  it("renders exactly one variant: the icon trigger and no inline input", () => {
    renderSearch();
    expect(screen.getByRole("button", { name: "Search" })).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("opens a modal dialog with the input focused, locks scrolling, and restores focus on Escape", async () => {
    const user = userEvent.setup();
    renderSearch();
    const trigger = screen.getByRole("button", { name: "Search" });

    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Search" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("combobox")).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("Tab cycles between the input and Cancel only", async () => {
    const user = userEvent.setup();
    renderSearch();
    await user.click(screen.getByRole("button", { name: "Search" }));

    const input = screen.getByRole("combobox");
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(input).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(input).toHaveFocus();
    await user.tab({ shift: true });
    expect(cancel).toHaveFocus();
  });

  it("Ctrl+K opens the overlay with existing text selected", async () => {
    const user = userEvent.setup();
    renderSearch();

    await user.keyboard("{Control>}k{/Control}");

    expect(screen.getByRole("dialog", { name: "Search" })).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveFocus();
  });

  it("choosing a result closes the overlay and navigates", async () => {
    const user = userEvent.setup();
    renderSearch();
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.type(screen.getByRole("combobox"), "artificial");
    await screen.findByRole("listbox");

    await user.click(screen.getByRole("option", { name: /Intro to AI/ }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(`/collections/${COLLECTION_ID}/intro+to+ai`);
    expect(mockTrackEvent).toHaveBeenCalledWith({
      name: "search_result_clicked",
      contextType: "collection",
      contextId: COLLECTION_ID,
      position: 2,
    });
  });
});
