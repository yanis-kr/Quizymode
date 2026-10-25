import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TopicSuggestion } from "@/api/taxonomy";
import SuggestedTopicChips from "./SuggestedTopicChips";

function chip(l2: string, reason: TopicSuggestion["reason"], description = ""): TopicSuggestion {
  return {
    categorySlug: "tech",
    l1: "ai-ml",
    l2,
    path: `tech › ai-ml › ${l2}`,
    description,
    score: 0,
    matchedTerms: [],
    reason,
  };
}

describe("SuggestedTopicChips", () => {
  it("renders at most five chips under the text heading with no badge for text suggestions", () => {
    const suggestions = ["a", "b", "c", "d", "e", "f", "g"].map((l2) => chip(l2, "text"));
    render(<SuggestedTopicChips suggestions={suggestions} phase="ready" onPick={() => {}} />);

    expect(screen.getByText("Suggested from your text")).toBeInTheDocument();
    expect(screen.getAllByTestId("topic-chip")).toHaveLength(5);
    expect(screen.queryByText("Yours")).not.toBeInTheDocument();
    expect(screen.queryByText("Popular")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Suggested from your text" })).toBeInTheDocument();
  });

  it("uses the Common topics heading and Yours / Popular badges for the fallback", () => {
    render(
      <SuggestedTopicChips
        suggestions={[chip("mine", "yours"), chip("pop", "popular")]}
        phase="ready"
        onPick={() => {}}
      />
    );
    expect(screen.getByText("Common topics")).toBeInTheDocument();
    expect(screen.queryByText("Suggested from your text")).not.toBeInTheDocument();
    expect(screen.getByText("Yours")).toBeInTheDocument();
    expect(screen.getByText("Popular")).toBeInTheDocument();
  });

  it("names each chip with its path, description and reason", () => {
    render(
      <SuggestedTopicChips
        suggestions={[chip("deep-learning", "yours", "Neural nets")]}
        phase="ready"
        onPick={() => {}}
      />
    );
    const button = screen.getByRole("button", { name: /tech.*ai-ml.*deep-learning/ });
    expect(button).toHaveAccessibleName(/Neural nets/);
    expect(button).toHaveAccessibleName(/Yours/);
  });

  it("calls onPick with the chip and its 1-based position", async () => {
    const user = userEvent.setup({ delay: null });
    const onPick = vi.fn();
    const suggestions = [chip("one", "text"), chip("two", "text"), chip("three", "text")];
    render(<SuggestedTopicChips suggestions={suggestions} phase="ready" onPick={onPick} />);

    await user.click(screen.getByRole("button", { name: /two/ }));
    expect(onPick).toHaveBeenCalledWith(suggestions[1], 2);
  });

  it("is never pre-selected", () => {
    render(<SuggestedTopicChips suggestions={[chip("one", "text")]} phase="ready" onPick={() => {}} />);
    expect(screen.getByTestId("topic-chip")).not.toHaveAttribute("aria-pressed");
    expect(screen.getByTestId("topic-chip")).not.toHaveAttribute("aria-current");
  });

  it("shows skeletons while the first request is pending and Finding topics once text is being searched", () => {
    const { rerender } = render(<SuggestedTopicChips suggestions={[]} phase="initial" onPick={() => {}} />);
    expect(screen.getByTestId("topic-chips-loading")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("Finding topics…")).not.toBeInTheDocument();

    rerender(<SuggestedTopicChips suggestions={[]} phase="loading" onPick={() => {}} />);
    expect(screen.getByText("Finding topics…")).toBeInTheDocument();
  });

  it("dims the chips of earlier text while newer text is fetched", () => {
    render(<SuggestedTopicChips suggestions={[chip("one", "text")]} phase="ready" isRefreshing onPick={() => {}} />);
    expect(screen.getByRole("group")).toHaveClass("opacity-60");
  });

  it("renders nothing when hidden or when the list is empty", () => {
    const { container, rerender } = render(<SuggestedTopicChips suggestions={[]} phase="hidden" onPick={() => {}} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<SuggestedTopicChips suggestions={[]} phase="ready" onPick={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the helper line under the chips", () => {
    render(
      <SuggestedTopicChips
        suggestions={[chip("one", "popular")]}
        phase="ready"
        onPick={() => {}}
        helperText="Topic suggestions use your title and file name for this file type."
      />
    );
    expect(screen.getByText(/title and file name/)).toBeInTheDocument();
  });
});
