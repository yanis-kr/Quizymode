import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SubmitTestDialog } from "./SubmitTestDialog";
import { TestPalettePanel } from "./TestPalette";
import { createQuizRun, reduceQuizRun } from "../quizRun";
import { getTestPalette } from "./paletteSelectors";

const noop = () => undefined;

function dialog(props: Partial<ComponentProps<typeof SubmitTestDialog>>) {
  return (
    <SubmitTestDialog
      total={5}
      unanswered={2}
      flagged={0}
      onReturn={noop}
      onShowUnanswered={noop}
      onShowFlagged={noop}
      onSubmit={noop}
      {...props}
    />
  );
}

describe("SubmitTestDialog unavailable pictures (#403)", () => {
  it("says how many unavailable-picture questions will not be scored, with the singular form", () => {
    const { rerender } = render(dialog({ unanswered: 3, notScored: 2 }));
    expect(screen.getByText("2 questions with an unavailable picture will not be scored.")).toBeInTheDocument();
    expect(screen.getByText("Unanswered questions count as wrong.")).toBeInTheDocument();

    rerender(dialog({ unanswered: 1, notScored: 1 }));
    expect(screen.getByText("1 question with an unavailable picture will not be scored.")).toBeInTheDocument();
    expect(screen.queryByText("Unanswered questions count as wrong.")).not.toBeInTheDocument();
  });

  it("renders as a child of document.body, outside any backdrop-filter ancestor", () => {
    const { container } = render(dialog({}));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(screen.getByRole("dialog").parentElement?.parentElement).toBe(document.body);
  });

  it("adds nothing when no picture is unavailable", () => {
    render(dialog({ notScored: 0 }));
    expect(screen.queryByText(/unavailable picture/)).not.toBeInTheDocument();
    expect(screen.getByText("Unanswered questions count as wrong.")).toBeInTheDocument();
  });
});

describe("TestPalettePanel not scored marker (#403)", () => {
  it("labels, counts and explains questions that will not be scored, and uses 44 px buttons", () => {
    let run = createQuizRun(
      { kind: "global", category: null, navigationKeywords: [], filterKeywords: [], quizSize: 3 },
      ["a", "b", "c"],
      "guest",
      "test"
    );
    run = reduceQuizRun(run, { type: "start-test", startedAt: "2026-01-01T00:00:00Z", timeLimitSec: null });
    const palette = getTestPalette(run, 0, ["b"]);

    render(<TestPalettePanel palette={palette} currentIndex={0} onSelect={vi.fn()} />);

    const buttons = screen.getAllByRole("button", { name: /^Question 2, unanswered, not scored \(picture unavailable\)$/ });
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons[0]).toHaveClass("h-11", "w-11", "border-dashed", "border-amber-500");
    expect(screen.getAllByText(/0 answered · 3 unanswered · 0 flagged · 1 not scored/).length).toBeGreaterThan(0);
    expect(screen.getByText("Not scored (picture unavailable)")).toBeInTheDocument();
  });
});
