import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { SearchGroups, SearchResponse } from "@/api/search";
import SearchPage from "./SearchPage";

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

const NO_GROUPS: SearchGroups = {
  categories: null,
  subcategories: null,
  collections: null,
  items: null,
  mine: null,
};

function response(groups: Partial<SearchGroups>): SearchResponse {
  return { query: "ai", groups: { ...NO_GROUPS, ...groups } };
}

const ALL_RESULTS = response({
  categories: { results: [], hasMore: false },
  subcategories: {
    results: [{ categorySlug: "tech", l1: "ai-ml", l2: null, description: "AI and ML", itemCount: 57 }],
    hasMore: true,
  },
  collections: {
    results: [{ id: COLLECTION_ID, name: "Intro to AI", description: "Basics", itemCount: 30 }],
    hasMore: false,
  },
  items: {
    results: [
      {
        id: ITEM_ID,
        snippet: { text: "What is AI?", highlights: [{ start: 8, length: 2 }] },
        categorySlug: "tech",
        l1: "ai-ml",
        l2: null,
      },
    ],
    hasMore: false,
  },
});

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderPage(url: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/search" element={<SearchPage />} />
          </Routes>
          <LocationDisplay />
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

describe("SearchPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isAuthenticated = false;
    mockSearch.mockResolvedValue(ALL_RESULTS);
  });

  it("shows the idle message and sends no request for a short query", () => {
    renderPage("/search?q=a");
    expect(screen.getByText(/Type at least 2 characters/)).toBeInTheDocument();
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("searches the All tab with 5 per group and renders sections with real links", async () => {
    renderPage("/search?q=ai");

    expect(await screen.findByRole("heading", { level: 1, name: "Results for “ai”" })).toBeInTheDocument();
    expect(mockSearch.mock.calls[0][0]).toEqual({
      q: "ai",
      types: ["categories", "subcategories", "collections", "items"],
      limit: 5,
      offset: 0,
    });

    expect(await screen.findByRole("heading", { level: 2, name: "Topics" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Collections" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Questions" })).toBeInTheDocument();

    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("/categories/tech/ai-ml");
    expect(screen.getByRole("link", { name: /Intro to AI/ })).toHaveAttribute(
      "href",
      `/collections/${COLLECTION_ID}/intro+to+ai`
    );
    expect(screen.getAllByRole("link", { name: /What is AI/ })[0]).toHaveAttribute("href", `/items/${ITEM_ID}`);
    expect(screen.getByRole("button", { name: "See all topics" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "See all collections" })).not.toBeInTheDocument();
  });

  it("fires search_performed once per committed search with no query text", async () => {
    const user = userEvent.setup();
    renderPage("/search?q=secretterm");
    await screen.findByRole("heading", { level: 2, name: "Topics" });

    await waitFor(() => expect(mockTrackEvent).toHaveBeenCalledTimes(1));
    expect(mockTrackEvent).toHaveBeenCalledWith({ name: "search_performed", contextType: "search", total: 3 });

    // A tab switch is not a new search.
    await user.click(screen.getByRole("tab", { name: "Topics" }));
    await waitFor(() => expect(mockSearch).toHaveBeenCalledTimes(2));
    expect(mockTrackEvent).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mockTrackEvent.mock.calls)).not.toContain("secretterm");
  });

  it("zero results still count as a search", async () => {
    mockSearch.mockResolvedValue(response({ categories: { results: [], hasMore: false } }));
    renderPage("/search?q=zzzz");

    expect(await screen.findByText("No results for “zzzz”")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse categories" })).toHaveAttribute("href", "/categories");
    expect(screen.getByRole("link", { name: "Browse collections" })).toHaveAttribute("href", "/collections");
    await waitFor(() =>
      expect(mockTrackEvent).toHaveBeenCalledWith({ name: "search_performed", contextType: "search", total: 0 })
    );
  });

  it("tabs follow the roving tabindex pattern and update the URL with replace semantics", async () => {
    const user = userEvent.setup();
    renderPage("/search?q=ai");
    const tabs = await screen.findAllByRole("tab");

    expect(tabs.map((tab) => tab.textContent)).toEqual(["All", "Topics", "Collections", "Questions"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[0]).toHaveAttribute("tabindex", "0");
    expect(tabs[1]).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "search-tab-all");

    tabs[0].focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByTestId("location")).toHaveTextContent("/search?q=ai&tab=topics");
    expect(screen.getByRole("tab", { name: "Topics" })).toHaveFocus();

    await user.keyboard("{End}");
    expect(screen.getByTestId("location")).toHaveTextContent("tab=questions");
    await user.keyboard("{ArrowRight}");
    expect(screen.getByTestId("location")).toHaveTextContent("/search?q=ai");
    expect(screen.getByTestId("location")).not.toHaveTextContent("tab=");
  });

  it("keeps focus on the selected tab when a keyboard tab change resets the page", async () => {
    const user = userEvent.setup();
    authState.isAuthenticated = true;
    mockSearch.mockResolvedValue(
      response({
        items: {
          results: [
            {
              id: ITEM_ID,
              snippet: { text: "What is water?", highlights: [] },
              categorySlug: "science",
              l1: "chemistry",
              l2: null,
            },
          ],
          hasMore: true,
        },
      })
    );
    renderPage("/search?q=water&tab=questions&page=2");
    const questions = await screen.findByRole("tab", { name: "Questions" });

    questions.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByTestId("location")).toHaveTextContent("tab=mine");
    expect(screen.getByTestId("location")).not.toHaveTextContent("page=");
    await waitFor(() => expect(mockSearch).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("tab", { name: "Mine" })).toHaveFocus();

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Questions" })).toHaveFocus();
  });

  it("only shows the Mine tab to signed-in visitors and treats an anonymous tab=mine as All", async () => {
    renderPage("/search?q=ai&tab=mine");
    await screen.findAllByRole("tab");
    expect(screen.queryByRole("tab", { name: "Mine" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "true");
  });

  it("signed-in visitors get the Mine tab and request mine", async () => {
    authState.isAuthenticated = true;
    mockSearch.mockResolvedValue(
      response({ mine: { results: [{ kind: "studyGuideDocument", id: ITEM_ID, title: "My notes" }], hasMore: false } })
    );
    renderPage("/search?q=notes&tab=mine");

    expect(await screen.findByRole("link", { name: /My notes/ })).toHaveAttribute(
      "href",
      `/study-guides/documents/${ITEM_ID}`
    );
    expect(mockSearch.mock.calls[0][0]).toMatchObject({ types: ["mine"], limit: 20, offset: 0 });
    expect(screen.getByRole("tab", { name: "Mine" })).toHaveAttribute("aria-selected", "true");
  });

  it("pages a single-type tab with offset, Previous disabled on page 1 and Next only when hasMore", async () => {
    const user = userEvent.setup();
    mockSearch.mockResolvedValue(
      response({
        collections: {
          results: [{ id: COLLECTION_ID, name: "Intro to AI", description: null, itemCount: 1 }],
          hasMore: true,
        },
      })
    );
    renderPage("/search?q=ai&tab=collections");

    const pager = await screen.findByRole("navigation", { name: "Search results pages" });
    expect(pager).toHaveTextContent("Page 1");
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(mockSearch).toHaveBeenLastCalledWith(
        { q: "ai", types: ["collections"], limit: 20, offset: 20 },
        expect.anything()
      )
    );
    expect(screen.getByTestId("location")).toHaveTextContent("/search?q=ai&tab=collections&page=2");
    await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "Collections, page 2" })).toHaveFocus());
  });

  it("disables Next when there are no more results", async () => {
    mockSearch.mockResolvedValue(
      response({
        collections: {
          results: [{ id: COLLECTION_ID, name: "Intro to AI", description: null, itemCount: 1 }],
          hasMore: false,
        },
      })
    );
    renderPage("/search?q=ai&tab=collections&page=11");

    await screen.findByRole("navigation", { name: "Search results pages" });
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
  });

  it("submitting the form keeps the tab and resets the page", async () => {
    const user = userEvent.setup();
    renderPage("/search?q=ai&tab=topics&page=3");
    const input = await screen.findByRole("textbox", { name: "Search Quizymode" });

    await user.clear(input);
    await user.type(input, "machine learning{Enter}");

    expect(screen.getByTestId("location")).toHaveTextContent("/search?q=machine+learning&tab=topics");
  });

  it("shows a 429 notice with a manual retry and does not retry on its own", async () => {
    const { AxiosError, AxiosHeaders } = await import("axios");
    const config = { headers: new AxiosHeaders() };
    mockSearch.mockRejectedValueOnce(
      new AxiosError("Too many", "ERR_BAD_REQUEST", config, null, {
        status: 429,
        statusText: "",
        data: {},
        headers: { "retry-after": "1" },
        config,
      })
    );
    const user = userEvent.setup();
    renderPage("/search?q=ai");

    expect(await screen.findByText("You are searching too fast. Try again in 1 second.")).toBeInTheDocument();
    expect(mockSearch).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Topics" })).toBeInTheDocument();
    expect(mockSearch).toHaveBeenCalledTimes(2);
  });

  it("shows an error message with retry for other failures", async () => {
    mockSearch.mockRejectedValueOnce(new Error("boom"));
    const user = userEvent.setup();
    renderPage("/search?q=ai");

    expect(await screen.findByText("Could not load search results.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Topics" })).toBeInTheDocument();
  });

  it("clicking a result reports its position", async () => {
    const user = userEvent.setup();
    renderPage("/search?q=ai");
    await screen.findByRole("heading", { level: 2, name: "Collections" });
    await waitFor(() => expect(mockTrackEvent).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("link", { name: /Intro to AI/ }));

    expect(mockTrackEvent).toHaveBeenCalledWith({
      name: "search_result_clicked",
      contextType: "collection",
      contextId: COLLECTION_ID,
      position: 2,
    });
  });
});
