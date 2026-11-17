import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { KeepGoing } from "./KeepGoing";
import { quizPathForScope } from "./keepGoingPaths";

vi.mock("./useExploreNextSets", () => ({
  useExploreNextSets: () => ({
    tiles: [{ id: "f1", label: "Ranked set", cta: "Play 5", to: "/quiz/languages?nav=german&size=5" }],
    isLoading: false,
  }),
}));

function renderKeepGoing(scope: string, onSelect = vi.fn()) {
  render(
    <MemoryRouter>
      <KeepGoing scope={scope} onSelect={onSelect} />
    </MemoryRouter>
  );
  return onSelect;
}

describe("KeepGoing (#711)", () => {
  it("AC 3.6.31 shows two related tiles and one Change of pace tile for an exam scope (AC2)", () => {
    renderKeepGoing("exams/aws/saa-c03");
    const block = screen.getByTestId("keep-going");
    expect(within(block).getByRole("heading", { name: "Keep going" })).toBeInTheDocument();
    expect(within(block).getByRole("link", { name: /AWS Solutions Architect Professional/ })).toHaveAttribute(
      "href",
      expect.stringContaining("size=5"),
    );
    expect(within(block).getByRole("heading", { name: "Change of pace" })).toBeInTheDocument();
    expect(within(block).getAllByRole("link")).toHaveLength(3);
  });

  it("AC 3.6.31 reports the 1-based position and a pace id when a tile is followed", () => {
    const onSelect = renderKeepGoing("exams/aws/saa-c03");
    screen.getByRole("link", { name: /AI and machine learning/ }).click();
    expect(onSelect).toHaveBeenCalledWith(3, "pace:tech/ai-ml");
  });

  it("falls back to ranked tiles with no Change of pace label for a scope missing from the map (AC3, AC4)", () => {
    renderKeepGoing("languages/german");
    expect(screen.getByRole("heading", { name: "Keep going" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Change of pace" })).toBeNull();
    expect(screen.getByRole("link", { name: /Ranked set/ })).toBeInTheDocument();
  });

  it("builds quiz links that keep the navigation keywords and set five questions", () => {
    expect(quizPathForScope("exams/aws/saa-c03")).toBe("/quiz/exams?nav=aws%2Csaa-c03&keywords=aws%2Csaa-c03&size=5");
  });
});
