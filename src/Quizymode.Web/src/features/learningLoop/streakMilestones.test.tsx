import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import { StreakMilestoneCelebration } from "./StreakMilestoneCelebration";
import { milestoneFor, readShownMilestones } from "./streakMilestones";

describe("streak milestones (#671, AC 3.32.2)", () => {
  beforeEach(() => installMemoryLocalStorage());

  it("only 3, 7, 14 and 30 are milestones", () => {
    expect([1, 2, 3, 4, 7, 10, 14, 29, 30, 31].map(milestoneFor)).toEqual([null, null, 3, null, 7, null, 14, null, 30, null]);
  });

  it.each([3, 7, 14, 30])("celebrates %i days once, then not again", (days) => {
    const first = render(<StreakMilestoneCelebration streak={days} />);
    expect(screen.getByRole("status")).toHaveTextContent(`${days}-day streak milestone`);
    expect(readShownMilestones()).toContain(days);
    first.unmount();

    render(<StreakMilestoneCelebration streak={days} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not celebrate a non-milestone streak", () => {
    render(<StreakMilestoneCelebration streak={5} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
