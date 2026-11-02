import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { GamesEmptyState } from "./GamesEmptyState";

const renderState = (props: Partial<ComponentProps<typeof GamesEmptyState>> = {}) =>
  render(
    <MemoryRouter>
      <GamesEmptyState quizPath="/quiz/geography/flags" {...props} />
    </MemoryRouter>,
  );

describe("GamesEmptyState picture explanation (#403)", () => {
  it("keeps the generic message when no picture question was left out", () => {
    renderState();
    expect(screen.getByRole("heading", { name: "Not enough short questions for games here" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("explains how many picture questions are not playable and links to the same scope's quiz", () => {
    renderState({ excludedPictures: 195 });
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No games for this set" })).toBeInTheDocument();
    expect(screen.getByText("195 picture questions here aren't playable as games. Practise them in Quiz.")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Open Quiz" });
    expect(link).toHaveAttribute("href", "/quiz/geography/flags");
    expect(link).toHaveClass("min-h-[44px]", "w-full");
  });

  it("keeps the generic reason and adds the picture line when the pool is not empty", () => {
    renderState({ excludedPictures: 4, poolEmpty: false });
    expect(screen.getByRole("heading", { name: "Not enough short questions for games here" })).toBeInTheDocument();
    expect(screen.getByText("4 picture questions here aren't playable as games. Practise them in Quiz.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "No games for this set" })).not.toBeInTheDocument();
  });

  it("uses the singular for one picture question", () => {
    renderState({ excludedPictures: 1 });
    expect(screen.getByText("1 picture question here isn't playable as a game. Practise it in Quiz.")).toBeInTheDocument();
  });
});
