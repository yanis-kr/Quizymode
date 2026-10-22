import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActivityHeatmap } from "./ActivityHeatmap";

const TODAY = "2026-10-22";

describe("ActivityHeatmap", () => {
  it("renders one named image per day with a count, intensity level and daily marker", () => {
    render(
      <ActivityHeatmap
        today={TODAY}
        showDailyMarker
        activity={[
          { date: "2026-10-21", sessions: 3, questions: 15, correct: 10, hasDaily: true },
          { date: "2026-10-20", sessions: 6, questions: 30, correct: 20, hasDaily: false },
          { date: "2026-10-19", sessions: 1, questions: 5, correct: 5, hasDaily: false },
        ]}
      />,
    );

    expect(screen.getAllByRole("img")).toHaveLength(182);
    const oct21 = screen.getByRole("img", { name: "3 sessions on Oct 21, daily quiz completed" });
    expect(oct21).toHaveAttribute("data-level", "3");
    expect(oct21).toHaveTextContent("3");
    expect(within(oct21).getByTestId("daily-marker")).toBeInTheDocument();
    const oct20 = screen.getByRole("img", { name: "6 sessions on Oct 20" });
    expect(oct20).toHaveAttribute("data-level", "4");
    expect(screen.getByRole("img", { name: "1 session on Oct 19" })).toHaveAttribute("data-level", "1");
    expect(screen.getByRole("img", { name: "0 sessions on Oct 18" })).toHaveAttribute("data-level", "0");
    expect(screen.getByText("Daily quiz completed")).toBeInTheDocument();
  });

  it("describes the totals in text and exposes a keyboard-focusable scroll region", async () => {
    render(
      <ActivityHeatmap
        today={TODAY}
        activity={[
          { date: "2026-10-21", sessions: 3, questions: 15, correct: 10, hasDaily: false },
          { date: "2026-10-20", sessions: 1, questions: 5, correct: 5, hasDaily: false },
        ]}
      />,
    );

    expect(screen.getByText(/4 sessions on 2 days in the last 26 weeks/)).toBeInTheDocument();
    expect(screen.getByText(/Busiest day: Oct 21 with 3 sessions/)).toBeInTheDocument();
    const region = screen.getByRole("group", { name: "Study activity calendar, last 26 weeks" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toHaveAttribute("aria-describedby");
    await userEvent.tab();
    expect(region).toHaveFocus();
  });

  it("offers the activity as a text list that is not colour dependent", () => {
    render(
      <ActivityHeatmap
        today={TODAY}
        activity={[{ date: "2026-10-21", sessions: 2, questions: 10, correct: 5, hasDaily: false }]}
      />,
    );
    const details = screen.getByText("Show activity as a list").closest("details");
    expect(details).not.toBeNull();
    expect(within(details as HTMLElement).getByText("2 sessions on Oct 21")).toBeInTheDocument();
  });

  it("states there is no activity and hides the list and daily legend", () => {
    render(<ActivityHeatmap today={TODAY} activity={[]} />);
    expect(screen.getByText("No study sessions in the last 26 weeks.")).toBeInTheDocument();
    expect(screen.queryByText("Show activity as a list")).not.toBeInTheDocument();
    expect(screen.queryByText("Daily quiz completed")).not.toBeInTheDocument();
  });

  it("scrolls inside its own container so a narrow screen does not overflow the page", () => {
    render(<ActivityHeatmap today={TODAY} activity={[]} />);
    const region = screen.getByRole("group", { name: /Study activity calendar/ });
    expect(region.className).toContain("overflow-x-auto");
    expect(region.className).toContain("max-w-full");
  });
});
