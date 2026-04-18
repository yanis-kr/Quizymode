import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ItemResponse } from "@/types/api";
import ItemListSection from "./ItemListSection";

vi.mock("./ItemListCard", () => ({
  default: ({ item }: { item: ItemResponse }) => (
    <div data-testid="item-card">{item.question}</div>
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
});
