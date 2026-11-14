import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ItemResponse } from "@/types/api";
import ItemListSection from "./ItemListSection";

vi.mock("./ItemListCard", () => ({
  default: ({
    item,
    showAnswer,
    revealed,
    onToggleReveal,
  }: {
    item: ItemResponse;
    showAnswer?: boolean;
    revealed?: boolean;
    onToggleReveal?: () => void;
  }) => (
    <div data-testid="item-card" data-show-answer={String(showAnswer)} data-revealed={String(revealed)}>
      {item.question}
      {onToggleReveal && (
        <button type="button" onClick={onToggleReveal}>
          reveal {item.id}
        </button>
      )}
    </div>
  ),
}));

function buildItem(id: string, question: string): ItemResponse {
  return {
    id,
    category: "Languages",
    isPrivate: false,
    question,
    correctAnswer: "Answer",
    incorrectAnswers: [],
    explanation: "",
    createdAt: "2026-04-17T00:00:00Z",
    keywords: [],
    collections: [],
  };
}

describe("ItemListSection", () => {
  it("renders bottom Previous and Next buttons when multiple pages exist", async () => {
    const user = userEvent.setup();
    const onPrevPage = vi.fn();
    const onNextPage = vi.fn();

    render(
      <ItemListSection
        items={[buildItem("1", "First question"), buildItem("2", "Second question")]}
        totalCount={20}
        page={2}
        totalPages={4}
        onPrevPage={onPrevPage}
        onNextPage={onNextPage}
      />
    );

    expect(screen.getAllByText("Page 2 of 4")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Previous" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Previous" }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(onPrevPage).toHaveBeenCalledOnce();
    expect(onNextPage).toHaveBeenCalledOnce();
  });

  it("hides the bottom pager when only one page exists", () => {
    render(
      <ItemListSection
        items={[buildItem("1", "Only question")]}
        totalCount={1}
        page={1}
        totalPages={1}
        onPrevPage={vi.fn()}
        onNextPage={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "Previous" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });

  it("passes the page toggle and each card's own reveal state down", async () => {
    const user = userEvent.setup();
    const onToggleReveal = vi.fn();
    render(
      <ItemListSection
        items={[buildItem("1", "First question"), buildItem("2", "Second question")]}
        totalCount={2}
        page={1}
        totalPages={1}
        onPrevPage={vi.fn()}
        onNextPage={vi.fn()}
        showAnswers={false}
        revealedIds={new Set(["2"])}
        onToggleReveal={onToggleReveal}
      />
    );

    const cards = screen.getAllByTestId("item-card");
    expect(cards[0]).toHaveAttribute("data-show-answer", "false");
    expect(cards[0]).toHaveAttribute("data-revealed", "false");
    expect(cards[1]).toHaveAttribute("data-revealed", "true");

    await user.click(screen.getByRole("button", { name: "reveal 1" }));
    expect(onToggleReveal).toHaveBeenCalledWith("1");
  });
});
