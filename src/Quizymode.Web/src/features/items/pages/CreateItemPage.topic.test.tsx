import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CreateItemPage from "./CreateItemPage";
import { itemsApi } from "@/api/items";
import { taxonomyApi, type TopicSuggestion } from "@/api/taxonomy";
import { useExtraKeywordAutocompleteSource } from "@/hooks/useExtraKeywordAutocompleteSource";
import { resetTopicSuggestionSuppression } from "@/features/topics/useTopicSuggestions";

const authState = vi.hoisted(() => ({ isAdmin: false }));
const { mockTrackEvent } = vi.hoisted(() => ({ mockTrackEvent: vi.fn() }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: true, isAdmin: authState.isAdmin, userId: "user-1" }),
}));

vi.mock("@/features/analytics/analyticsEvents", () => ({
  trackEvent: mockTrackEvent,
  createAnalyticsId: () => "run-1",
}));

vi.mock("@/api/items", () => ({ itemsApi: { create: vi.fn() } }));

vi.mock("@/api/taxonomy", () => ({
  taxonomyApi: { getAll: vi.fn(), suggest: vi.fn() },
}));

vi.mock("@/hooks/useExtraKeywordAutocompleteSource", () => ({
  useExtraKeywordAutocompleteSource: vi.fn(),
}));

function chip(l1: string, l2: string, description: string): TopicSuggestion {
  return {
    categorySlug: "science",
    l1,
    l2,
    path: `science › ${l1} › ${l2}`,
    description,
    score: 0,
    matchedTerms: [],
    reason: "popular",
  };
}

const muscularChip = chip("anatomy", "muscular", "Muscles");
const cellsChip = chip("physiology", "cells", "Cells");

function getFieldControl(labelText: string) {
  const label = screen.getByText(labelText);
  const control = label.nextElementSibling;
  if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) {
    throw new Error(`No input control found for label "${labelText}"`);
  }
  return control;
}

function renderPage(initialEntry: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/create/question" element={<CreateItemPage />} />
          <Route path="/items/:id" element={<div>Item Detail</div>} />
          <Route path="/login" element={<div>Login</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function fillRest(user: ReturnType<typeof userEvent.setup>) {
  await user.type(getFieldControl("Question *"), "What moves muscles?");
  await user.type(getFieldControl("Correct Answer *"), "Motor neurons");
  await user.type(screen.getByPlaceholderText("Incorrect answer 1"), "Tendons");
}

describe("CreateItemPage topic suggestions (#323)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTopicSuggestionSuppression();
    authState.isAdmin = false;
    vi.mocked(taxonomyApi.getAll).mockResolvedValue({
      categories: [
        {
          slug: "science",
          name: "Science",
          description: "",
          itemCount: 0,
          allKeywordSlugs: ["anatomy", "muscular", "skeletal", "physiology", "cells"],
          groups: [
            {
              slug: "anatomy",
              description: null,
              itemCount: 0,
              keywords: [
                { slug: "muscular", description: "Muscles", itemCount: 0 },
                { slug: "skeletal", description: "Bones", itemCount: 0 },
              ],
            },
            {
              slug: "physiology",
              description: null,
              itemCount: 0,
              keywords: [{ slug: "cells", description: "Cells", itemCount: 0 }],
            },
          ],
        },
      ],
    });
    vi.mocked(taxonomyApi.suggest).mockResolvedValue({ suggestions: [muscularChip, cellsChip] });
    vi.mocked(useExtraKeywordAutocompleteSource).mockReturnValue({
      extraKeywordAutocompleteSource: [],
      itemTagKeywordsLoading: false,
    });
    vi.mocked(itemsApi.create).mockResolvedValue({ id: "item-9" } as Awaited<ReturnType<typeof itemsApi.create>>);
  });

  it("blocks submit without a topic, shows the topic copy and focuses the search box", async () => {
    // AC 12.14
    const user = userEvent.setup({ delay: null });
    renderPage("/create/question");
    await screen.findAllByTestId("topic-chip");
    await fillRest(user);

    await user.click(screen.getByRole("button", { name: /save and study/i }));

    expect(
      await screen.findByText(/choose a topic: pick a suggestion, search, or browse all topics/i)
    ).toBeInTheDocument();
    expect(itemsApi.create).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: /search topics/i })).toHaveFocus();
    expect(screen.getByRole("group", { name: "Topic *" })).toHaveAttribute("aria-invalid", "true");
  });

  it("never pre-selects a chip, and one tap fills category, L1 and L2 so the save succeeds", async () => {
    // AC 12.13
    const user = userEvent.setup({ delay: null });
    renderPage("/create/question");
    const chips = await screen.findAllByTestId("topic-chip");
    expect(screen.queryByTestId("topic-pill")).not.toBeInTheDocument();

    await user.click(chips[1]);
    await fillRest(user);
    await user.click(screen.getByRole("button", { name: /save and study/i }));

    await waitFor(() =>
      expect(itemsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ category: "science", navigationKeyword1: "physiology", navigationKeyword2: "cells" })
      )
    );
  });

  it("sends shown and accepted only after a successful save, omitting the path for a private item", async () => {
    // AC 5.4.12
    const user = userEvent.setup({ delay: null });
    renderPage("/create/question");
    await user.click((await screen.findAllByTestId("topic-chip"))[1]);
    await fillRest(user);

    expect(mockTrackEvent).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /save and study/i }));
    await screen.findByText("Item Detail");

    expect(mockTrackEvent.mock.calls.map(([payload]) => payload)).toEqual([
      { name: "topic_suggestion_shown", contextType: "topic", contextId: "popular", runId: "run-1", total: 2 },
      { name: "topic_suggestion_accepted", contextType: "topic", runId: "run-1", position: 2 },
    ]);
  });

  it("sends the path of a public item and never any of the typed text", async () => {
    // AC 5.4.12
    authState.isAdmin = true;
    const user = userEvent.setup({ delay: null });
    renderPage("/create/question");
    await user.click((await screen.findAllByTestId("topic-chip"))[0]);
    await fillRest(user);
    await user.click(screen.getByRole("checkbox", { name: /private item/i }));
    await user.click(screen.getByRole("button", { name: /save and study/i }));
    await screen.findByText("Item Detail");

    expect(mockTrackEvent).toHaveBeenLastCalledWith({
      name: "topic_suggestion_accepted",
      contextType: "topic",
      contextId: "science/anatomy/muscular",
      runId: "run-1",
      position: 1,
    });
    expect(JSON.stringify(mockTrackEvent.mock.calls)).not.toMatch(/muscles\?|motor neurons|tendons/i);
  });

  it("sends overridden with the saved path when the user picks a topic that was not suggested", async () => {
    // AC 5.4.12
    authState.isAdmin = true;
    const user = userEvent.setup({ delay: null });
    renderPage("/create/question");
    await screen.findAllByTestId("topic-chip");

    await user.type(screen.getByRole("combobox", { name: /search topics/i }), "skeletal");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(await screen.findByTestId("topic-pill")).toHaveTextContent("skeletal");

    await fillRest(user);
    await user.click(screen.getByRole("checkbox", { name: /private item/i }));
    await user.click(screen.getByRole("button", { name: /save and study/i }));
    await screen.findByText("Item Detail");

    const names = mockTrackEvent.mock.calls.map(([payload]) => payload.name);
    expect(names).toEqual(["topic_suggestion_shown", "topic_suggestion_overridden"]);
    expect(mockTrackEvent).toHaveBeenLastCalledWith({
      name: "topic_suggestion_overridden",
      contextType: "topic",
      contextId: "science/anatomy/skeletal",
      runId: "run-1",
    });
  });

  it("sends nothing when no chip was ever shown", async () => {
    vi.mocked(taxonomyApi.suggest).mockResolvedValue({ suggestions: [] });
    const user = userEvent.setup({ delay: null });
    renderPage("/create/question?category=science&keywords=anatomy,muscular");
    await waitFor(() => expect(screen.getByLabelText(/subtopic/i)).toHaveValue("muscular"));
    await fillRest(user);
    await user.click(screen.getByRole("button", { name: /save and study/i }));
    await screen.findByText("Item Detail");

    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it("treats a URL prefill as the user's choice: no chips and no suggest request", async () => {
    // AC 12.13
    renderPage("/create/question?category=science&keywords=anatomy,muscular");
    expect(await screen.findByTestId("topic-pill")).toBeInTheDocument();
    expect(screen.queryByTestId("topic-chip")).not.toBeInTheDocument();
    expect(taxonomyApi.suggest).not.toHaveBeenCalled();
  });

  it("asks for suggestions once for the question after a pause, not per keystroke", async () => {
    // AC 12.10
    const user = userEvent.setup({ delay: null });
    renderPage("/create/question");
    await screen.findAllByTestId("topic-chip");
    expect(taxonomyApi.suggest).toHaveBeenCalledTimes(1);

    await user.type(getFieldControl("Question *"), "How do motor neurons control muscle contraction?");
    expect(taxonomyApi.suggest).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(taxonomyApi.suggest).toHaveBeenCalledTimes(2), { timeout: 3000 });
    expect(vi.mocked(taxonomyApi.suggest).mock.calls[1][0]).toBe(
      "How do motor neurons control muscle contraction?"
    );
  });
});
