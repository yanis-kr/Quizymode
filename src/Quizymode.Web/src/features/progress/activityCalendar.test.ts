import { describe, expect, it } from "vitest";
import type { GuestRunSummary } from "@/features/guestHistory/guestHistoryStorage";
import {
  addDays,
  aggregateGuestActivity,
  buildCalendar,
  currentStreak,
  describeDay,
  intensityFor,
  longestStreak,
} from "./activityCalendar";

// 2026-10-22 is a Thursday.
const TODAY = "2026-10-22";

function run(completedAt: string, correct = 3, total = 5): GuestRunSummary {
  return { runId: completedAt, completedAt, correct, total, source: null, missedItemIds: [], mode: "quiz" };
}

describe("intensityFor", () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 3],
    [5, 4],
    [40, 4],
  ])("maps %i sessions to level %i", (sessions, level) => {
    expect(intensityFor(sessions)).toBe(level);
  });
});

describe("describeDay", () => {
  it("names the day with a count and pluralises", () => {
    expect(describeDay({ date: "2026-10-21", sessions: 3, hasDaily: false })).toBe("3 sessions on Oct 21");
    expect(describeDay({ date: "2026-10-21", sessions: 1, hasDaily: false })).toBe("1 session on Oct 21");
    expect(describeDay({ date: "2026-10-21", sessions: 0, hasDaily: false })).toBe("0 sessions on Oct 21");
  });

  it("mentions a completed daily quiz", () => {
    expect(describeDay({ date: "2026-10-21", sessions: 2, hasDaily: true })).toBe("2 sessions on Oct 21, daily quiz completed");
  });
});

describe("buildCalendar", () => {
  it("lays out Sunday-first week columns ending on today", () => {
    const calendar = buildCalendar([], TODAY);
    // Window start is 2026-04-24 (Friday), so the grid starts Sunday 2026-04-19: 27 columns, today on Thursday.
    expect(calendar.weeks).toHaveLength(27);
    expect(calendar.weeks.every((week) => week.length === 7)).toBe(true);
    const first = calendar.weeks[0];
    expect(first.slice(0, 5)).toEqual([null, null, null, null, null]);
    expect(first[5]?.date).toBe("2026-04-24");
    const last = calendar.weeks[calendar.weeks.length - 1];
    expect(last[4]?.date).toBe(TODAY);
    expect(last[5]).toBeNull();
    expect(calendar.weeks.flat().filter((cell) => cell !== null)).toHaveLength(182);
  });

  it("is exactly 26 columns when today is a Saturday", () => {
    expect(buildCalendar([], "2026-10-24").weeks).toHaveLength(26);
  });

  it("applies activity, intensity, daily marker and totals", () => {
    const calendar = buildCalendar(
      [
        { date: "2026-10-21", sessions: 5, questions: 25, correct: 20, hasDaily: true },
        { date: "2026-10-20", sessions: 1, questions: 5, correct: 3, hasDaily: false },
        { date: "2025-01-01", sessions: 9, questions: 9, correct: 9, hasDaily: false },
      ],
      TODAY,
    );
    const cells = calendar.weeks.flat().filter((cell) => cell !== null);
    const oct21 = cells.find((cell) => cell.date === "2026-10-21");
    expect(oct21).toMatchObject({ sessions: 5, level: 4, hasDaily: true });
    expect(cells.find((cell) => cell.date === "2026-10-20")?.level).toBe(1);
    expect(cells.find((cell) => cell.date === "2026-10-19")).toMatchObject({ sessions: 0, level: 0 });
    expect(calendar.activeDays).toBe(2);
    expect(calendar.totalSessions).toBe(6);
    expect(calendar.busiest?.date).toBe("2026-10-21");
  });

  it("labels months without overlapping", () => {
    const labels = buildCalendar([], TODAY).monthLabels;
    expect(labels.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < labels.length; i += 1) {
      expect(labels[i].weekIndex - labels[i - 1].weekIndex).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("streaks", () => {
  const days = (...offsets: number[]) => new Set(offsets.map((offset) => addDays(TODAY, -offset)));

  it.each([
    [[], 0],
    [[0], 1],
    [[1], 1],
    [[2], 0],
    [[0, 1, 2, 4], 3],
    [[1, 2, 3, 6], 3],
  ])("current streak for days-ago %j is %i", (offsets, expected) => {
    expect(currentStreak(days(...offsets), TODAY)).toBe(expected);
  });

  it("finds the longest streak across gaps", () => {
    expect(longestStreak(days(0, 1, 5, 6, 7, 8, 12))).toBe(4);
    expect(longestStreak(new Set())).toBe(0);
  });
});

describe("aggregateGuestActivity", () => {
  const now = Date.parse("2026-10-22T10:00:00.000Z");

  it("groups runs by UTC day and computes streaks", () => {
    const guest = aggregateGuestActivity(
      [
        run("2026-10-22T00:00:01.000Z", 2, 4),
        run("2026-10-21T23:59:59.000Z", 3, 5),
        run("2026-10-21T01:00:00.000Z", 1, 5),
        run("2026-10-10T12:00:00.000Z"),
      ],
      now,
    );
    expect(guest.today).toBe("2026-10-22");
    expect(guest.activity.map((day) => [day.date, day.sessions, day.questions, day.correct])).toEqual([
      ["2026-10-10", 1, 5, 3],
      ["2026-10-21", 2, 10, 4],
      ["2026-10-22", 1, 4, 2],
    ]);
    expect(guest.currentStreak).toBe(2);
    expect(guest.longestStreak).toBe(2);
    expect(guest.totalSessions).toBe(4);
    expect(guest.activity.every((day) => !day.hasDaily)).toBe(true);
  });

  it("handles no history", () => {
    expect(aggregateGuestActivity([], now)).toMatchObject({ activity: [], currentStreak: 0, longestStreak: 0, totalSessions: 0 });
  });
});
