import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { taxonomyApi, type TaxonomyResponse, type TopicSuggestion } from "@/api/taxonomy";
import { ItemTopicScopeFields } from "./ItemTopicScopeFields";
import { applyTopicScopePatch, isTopicComplete, type TopicScopePatch } from "@/features/topics/topicScope";
import { resetTopicSuggestionSuppression } from "@/features/topics/useTopicSuggestions";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ userId: "user-1" }),
}));

vi.mock("@/api/taxonomy", () => ({
  taxonomyApi: { getAll: vi.fn(), suggest: vi.fn() },
}));

const taxonomy: TaxonomyResponse = {
  categories: [
    {
      slug: "tech",
      name: "tech",
      description: "Technology",
      itemCount: 0,
      allKeywordSlugs: [],
      groups: [
        {
          slug: "ai-ml",
          description: "AI and ML",
          itemCount: 0,
          keywords: [
            { slug: "deep-learning", description: "Neural nets", itemCount: 0 },
            { slug: "nlp", description: "Language", itemCount: 0 },
          ],
        },
      ],
    },
    {
      slug: "science",
      name: "science",
      description: "Science",
      itemCount: 0,
      allKeywordSlugs: [],
      groups: [
        {
          slug: "biology",
          description: null,
          itemCount: 0,
          keywords: [{ slug: "plants", description: null, itemCount: 0 }],
        },
      ],
    },
  ],
};

const deepLearning: TopicSuggestion = {
  categorySlug: "tech",
  l1: "ai-ml",
  l2: "deep-learning",
  path: "tech › ai-ml › deep-learning",
  description: "Neural nets",
  score: 0.7,
  matchedTerms: [],
  reason: "text",
};
const nlp: TopicSuggestion = { ...deepLearning, l2: "nlp", path: "tech › ai-ml › nlp", description: "Language" };

interface HarnessProps {
  initial?: { category: string; rank1: string; rank2: string };
  suggestionText?: string;
  error?: string;
  onScope?: (patch: TopicScopePatch) => void;
  onShown?: (suggestions: TopicSuggestion[]) => void;
}

function Harness({ initial, suggestionText, error, onScope, onShown }: HarnessProps) {
  const [scope, setScope] = useState(initial ?? { category: "", rank1: "", rank2: "" });
  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <ItemTopicScopeFields
        idPrefix="t"
        category={scope.category}
        rank1={scope.rank1}
        rank2={scope.rank2}
        suggestionText={suggestionText}
        error={error}
        onSuggestionsShown={onShown}
        onScopeChange={(patch) => {
          onScope?.(patch);
          setScope((current) => applyTopicScopePatch(current, patch));
        }}
      />
      <span data-testid="scope">{`${scope.category}|${scope.rank1}|${scope.rank2}`}</span>
    </form>
  );
}

function renderHarness(props: HarnessProps = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness {...props} />
    </QueryClientProvider>
  );
}

describe("ItemTopicScopeFields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTopicSuggestionSuppression();
    vi.mocked(taxonomyApi.getAll).mockResolvedValue(taxonomy);
    vi.mocked(taxonomyApi.suggest).mockResolvedValue({ suggestions: [deepLearning, nlp] });
  });

  it("state A shows chips, the search box and a collapsed Browse, with the legend Topic *", async () => {
    // AC 12.13
    renderHarness({ suggestionText: "" });

    expect(await screen.findAllByTestId("topic-chip")).toHaveLength(2);
    expect(screen.getByRole("group", { name: "Topic *" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /search topics/i })).toBeInTheDocument();
    const details = screen.getByText("Browse all topics").closest("details");
    expect(details).not.toHaveAttribute("open");
    expect(screen.queryByTestId("topic-pill")).not.toBeInTheDocument();
    expect(screen.getByTestId("scope")).toHaveTextContent("||");
  });

  it("never pre-selects: chips alone leave the topic empty", async () => {
    // AC 12.13
    renderHarness({ suggestionText: "" });
    await screen.findAllByTestId("topic-chip");
    expect(screen.getByTestId("scope")).toHaveTextContent("||");
  });

  it("a chip sets category, L1 and L2 in one patch, shows the pill and focuses its remove button", async () => {
    // AC 12.13
    const user = userEvent.setup({ delay: null });
    const onScope = vi.fn();
    renderHarness({ suggestionText: "", onScope });
    await user.click((await screen.findAllByTestId("topic-chip"))[1]);

    expect(onScope).toHaveBeenCalledTimes(1);
    expect(onScope).toHaveBeenCalledWith({ category: "tech", rank1: "ai-ml", rank2: "nlp" });
    expect(screen.getByTestId("scope")).toHaveTextContent("tech|ai-ml|nlp");
    expect(screen.getByTestId("topic-pill")).toHaveTextContent("tech");
    expect(screen.queryByTestId("topic-chip")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /search topics/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove topic tech, ai-ml, nlp" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Selected topic tech, ai-ml, nlp.");
  });

  it("removing the pill clears all three values, brings the cached chips back and focuses the search box", async () => {
    // AC 12.13
    const user = userEvent.setup({ delay: null });
    renderHarness({ suggestionText: "" });
    await user.click((await screen.findAllByTestId("topic-chip"))[0]);
    const callsBefore = vi.mocked(taxonomyApi.suggest).mock.calls.length;

    await user.click(screen.getByRole("button", { name: /remove topic/i }));

    expect(screen.getByTestId("scope")).toHaveTextContent("||");
    expect(screen.getByRole("combobox", { name: /search topics/i })).toHaveFocus();
    expect(await screen.findAllByTestId("topic-chip")).toHaveLength(2);
    expect(vi.mocked(taxonomyApi.suggest).mock.calls.length).toBe(callsBefore);
  });

  it("makes no suggest request after a pick, however much the text changes", async () => {
    // AC 12.13
    const user = userEvent.setup({ delay: null });
    const { rerender } = renderHarness({ suggestionText: "" });
    await user.click((await screen.findAllByTestId("topic-chip"))[0]);
    const calls = vi.mocked(taxonomyApi.suggest).mock.calls.length;

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={queryClient}>
        <Harness
          initial={{ category: "tech", rank1: "ai-ml", rank2: "nlp" }}
          suggestionText="A long piece of text about something else entirely, well over twenty characters"
        />
      </QueryClientProvider>
    );
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(vi.mocked(taxonomyApi.suggest).mock.calls.length).toBe(calls);
    expect(screen.getByTestId("topic-pill")).toBeInTheDocument();
  });

  it("a category-only prefill is state P: no chips, no suggest call, Browse open with the warnings", async () => {
    // AC 12.13
    renderHarness({ suggestionText: "", initial: { category: "tech", rank1: "", rank2: "" } });

    await screen.findByRole("option", { name: "science" });
    const details = screen.getByText("Browse all topics").closest("details");
    expect(details).toHaveAttribute("open");
    expect(screen.queryByTestId("topic-chip")).not.toBeInTheDocument();
    expect(screen.queryByTestId("topic-pill")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /search topics/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^category \*$/i)).toHaveValue("tech");
    expect(taxonomyApi.suggest).not.toHaveBeenCalled();
  });

  it("a legacy L1/L2 shows the amber warnings and keeps Browse open", async () => {
    // AC 12.13
    renderHarness({ initial: { category: "tech", rank1: "old-topic", rank2: "old-sub" } });

    expect(await screen.findByText(/not in the taxonomy list for this category/i)).toBeInTheDocument();
    expect(screen.getByText("Browse all topics").closest("details")).toHaveAttribute("open");
    expect(screen.queryByTestId("topic-pill")).not.toBeInTheDocument();
  });

  it("keeps the three selects mounted with their ids, and the category select is not required", async () => {
    // AC 12.13
    renderHarness({ initial: { category: "tech", rank1: "ai-ml", rank2: "nlp" } });

    expect(await screen.findByTestId("topic-pill")).toBeInTheDocument();
    await waitFor(() => expect(document.getElementById("t-category")).toHaveValue("tech"));
    expect(document.getElementById("t-rank1")).toHaveValue("ai-ml");
    expect(document.getElementById("t-rank2")).toHaveValue("nlp");
    expect(document.getElementById("t-category")).not.toBeRequired();
    expect(screen.getByText("Browse all topics").closest("details")).toHaveAttribute("hidden");
  });

  it("choosing through the Browse selects ends in the pill and moves focus to its remove button", async () => {
    // AC 12.13
    const user = userEvent.setup({ delay: null });
    renderHarness();
    await screen.findByRole("option", { name: "tech" });

    await user.click(screen.getByText("Browse all topics"));
    await user.selectOptions(screen.getByLabelText(/^category \*$/i), "tech");
    await user.selectOptions(screen.getByLabelText(/primary topic/i), "ai-ml");
    expect(screen.queryByTestId("topic-pill")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/subtopic/i), "deep-learning");

    expect(await screen.findByTestId("topic-pill")).toHaveTextContent("deep-learning");
    expect(screen.getByRole("button", { name: /remove topic tech, ai-ml, deep-learning/i })).toHaveFocus();
  });

  it("an edit-mode stored path renders the pill and no chips", async () => {
    // AC 12.11
    renderHarness({ initial: { category: "tech", rank1: "ai-ml", rank2: "nlp" } });
    expect(await screen.findByTestId("topic-pill")).toHaveTextContent("tech");
    expect(screen.queryByTestId("topic-chip")).not.toBeInTheDocument();
    expect(taxonomyApi.suggest).not.toHaveBeenCalled();
  });

  it("makes no suggest request without a suggestionText", async () => {
    // AC 12.11
    renderHarness();
    await screen.findByRole("option", { name: "tech" });
    expect(screen.queryByTestId("topic-chip")).not.toBeInTheDocument();
    expect(taxonomyApi.suggest).not.toHaveBeenCalled();
  });

  it("reports the chips that were shown", async () => {
    // AC 12.18
    const onShown = vi.fn();
    renderHarness({ suggestionText: "", onShown });
    await screen.findAllByTestId("topic-chip");
    await waitFor(() => expect(onShown).toHaveBeenCalledWith([deepLearning, nlp]));
  });

  it("announces the suggestions once they arrive", async () => {
    // AC 12.13
    renderHarness({ suggestionText: "" });
    await screen.findAllByTestId("topic-chip");
    expect(screen.getByRole("status")).toHaveTextContent("2 topic suggestions available.");
  });

  it("shows the parent's error on the group (aria-invalid, aria-describedby)", async () => {
    // AC 12.14
    renderHarness({ error: "Choose a topic: pick a suggestion, search, or browse all topics." });
    const group = screen.getByRole("group", { name: "Topic *" });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Choose a topic");
    expect(group).toHaveAttribute("aria-invalid", "true");
    expect(group).toHaveAttribute("aria-describedby", alert.id);
    expect(screen.getByRole("combobox", { name: /search topics/i })).toHaveAttribute("aria-invalid", "true");
    await screen.findByRole("option", { name: "tech" });
  });

  it("picking from the search box works without chips", async () => {
    // AC 12.15
    const user = userEvent.setup({ delay: null });
    renderHarness();
    await screen.findByRole("option", { name: "tech" });
    await user.type(screen.getByRole("combobox", { name: /search topics/i }), "deep");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByTestId("scope")).toHaveTextContent("tech|ai-ml|deep-learning");
    expect(screen.getByTestId("topic-pill")).toBeInTheDocument();
  });
});

describe("topicScope helpers", () => {
  it("applies the cascade rules and full-path patches", () => {
    const current = { category: "tech", rank1: "ai-ml", rank2: "nlp" };
    expect(applyTopicScopePatch(current, { category: "science", rank1: "", rank2: "" })).toEqual({
      category: "science",
      rank1: "",
      rank2: "",
    });
    expect(applyTopicScopePatch(current, { rank1: "other" })).toEqual({ category: "tech", rank1: "other", rank2: "" });
    expect(applyTopicScopePatch(current, { rank2: "x" })).toEqual({ category: "tech", rank1: "ai-ml", rank2: "x" });
    expect(applyTopicScopePatch(current, { category: "a", rank1: "b", rank2: "c" })).toEqual({
      category: "a",
      rank1: "b",
      rank2: "c",
    });
  });

  it("isTopicComplete needs all three values", () => {
    expect(isTopicComplete({ category: "a", rank1: "b", rank2: "c" })).toBe(true);
    expect(isTopicComplete({ category: "a", rank1: "b", rank2: " " })).toBe(false);
    expect(isTopicComplete({ category: "", rank1: "", rank2: "" })).toBe(false);
  });
});
