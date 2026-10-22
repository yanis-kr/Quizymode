import type { StudyActivityDay } from "@/api/studySessions";
import type { GuestRunSummary } from "@/features/guestHistory/guestHistoryStorage";

/** Pure date and aggregation helpers for the My progress page (issue #259). Every day is a UTC calendar day. */

export const HEATMAP_DAYS = 182;
export const INTENSITY_LEVELS = [0, 1, 2, 3, 4] as const;
export type IntensityLevel = (typeof INTENSITY_LEVELS)[number];

/** Human description of each intensity level, used by the legend. */
export const INTENSITY_LABELS: Record<IntensityLevel, string> = {
  0: "0 sessions",
  1: "1 session",
  2: "2 sessions",
  3: "3 to 4 sessions",
  4: "5 or more sessions",
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const dayFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });

export function parseIsoDay(day: string): number {
  if (!ISO_DAY.test(day)) return Number.NaN;
  const [year, month, date] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date);
}

export function toIsoDay(utcMs: number): string {
  return new Date(utcMs).toISOString().slice(0, 10);
}

export function addDays(day: string, delta: number): string {
  return toIsoDay(parseIsoDay(day) + delta * MS_PER_DAY);
}

export function formatDay(day: string): string {
  return dayFormatter.format(new Date(parseIsoDay(day)));
}

export function intensityFor(sessions: number): IntensityLevel {
  if (sessions <= 0) return 0;
  if (sessions === 1) return 1;
  if (sessions === 2) return 2;
  if (sessions <= 4) return 3;
  return 4;
}

/** Accessible name for one calendar day, for example "3 sessions on Oct 21". */
export function describeDay(day: StudyActivityDay | { date: string; sessions: number; hasDaily: boolean }): string {
  const count = `${day.sessions} ${day.sessions === 1 ? "session" : "sessions"} on ${formatDay(day.date)}`;
  return day.hasDaily ? `${count}, daily quiz completed` : count;
}

export interface CalendarCell {
  date: string;
  sessions: number;
  questions: number;
  correct: number;
  hasDaily: boolean;
  level: IntensityLevel;
}

/** Columns are weeks (Sunday first); a null cell is outside the shown range and is rendered blank. */
export type CalendarWeek = (CalendarCell | null)[];

export interface CalendarMonthLabel {
  weekIndex: number;
  label: string;
}

export interface Calendar {
  weeks: CalendarWeek[];
  monthLabels: CalendarMonthLabel[];
  activeDays: number;
  totalSessions: number;
  busiest: CalendarCell | null;
}

/** Lays out the last `days` UTC days ending at `today` as Sunday-first week columns. */
export function buildCalendar(activity: StudyActivityDay[], today: string, days: number = HEATMAP_DAYS): Calendar {
  const byDate = new Map(activity.map((entry) => [entry.date, entry]));
  const start = addDays(today, -(days - 1));
  const startWeekday = new Date(parseIsoDay(start)).getUTCDay();
  const gridStart = addDays(start, -startWeekday);
  const totalCells = (Math.floor((parseIsoDay(today) - parseIsoDay(gridStart)) / MS_PER_DAY / 7) + 1) * 7;

  const weeks: CalendarWeek[] = [];
  const monthLabels: CalendarMonthLabel[] = [];
  let activeDays = 0;
  let totalSessions = 0;
  let busiest: CalendarCell | null = null;

  for (let index = 0; index < totalCells; index += 1) {
    const date = addDays(gridStart, index);
    const weekIndex = Math.floor(index / 7);
    if (index % 7 === 0) weeks.push([]);

    const inRange = date >= start && date <= today;
    if (!inRange) {
      weeks[weekIndex].push(null);
      continue;
    }

    const entry = byDate.get(date);
    const sessions = entry?.sessions ?? 0;
    const cell: CalendarCell = {
      date,
      sessions,
      questions: entry?.questions ?? 0,
      correct: entry?.correct ?? 0,
      hasDaily: entry?.hasDaily ?? false,
      level: intensityFor(sessions),
    };
    weeks[weekIndex].push(cell);

    if (sessions > 0) {
      activeDays += 1;
      totalSessions += sessions;
      if (!busiest || sessions > busiest.sessions) busiest = cell;
    }
  }

  let lastLabelledMonth = -1;
  weeks.forEach((week, weekIndex) => {
    const first = week.find((cell): cell is CalendarCell => cell !== null);
    if (!first) return;
    const month = new Date(parseIsoDay(first.date)).getUTCMonth();
    if (month === lastLabelledMonth) return;
    lastLabelledMonth = month;
    const previous = monthLabels[monthLabels.length - 1];
    // Month names are about 3 columns wide; skip one that would overlap the previous label.
    if (previous && weekIndex - previous.weekIndex < 3) return;
    monthLabels.push({ weekIndex, label: monthFormatter.format(new Date(parseIsoDay(first.date))) });
  });

  return { weeks, monthLabels, activeDays, totalSessions, busiest };
}

/** Same rule as the server: consecutive active days ending today, or yesterday when today has none yet. */
export function currentStreak(activeDays: ReadonlySet<string>, today: string): number {
  let cursor = activeDays.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (activeDays.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function longestStreak(activeDays: ReadonlySet<string>): number {
  const sorted = Array.from(activeDays).sort();
  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of sorted) {
    run = previous !== null && addDays(previous, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  return longest;
}

export interface GuestActivity {
  today: string;
  activity: StudyActivityDay[];
  currentStreak: number;
  longestStreak: number;
  totalSessions: number;
}

/** Builds the same per-day shape the API returns from browser-local guest history. */
export function aggregateGuestActivity(summaries: GuestRunSummary[], now: number = Date.now()): GuestActivity {
  const today = toIsoDay(now);
  const byDay = new Map<string, StudyActivityDay>();
  for (const summary of summaries) {
    const timestamp = Date.parse(summary.completedAt);
    if (Number.isNaN(timestamp)) continue;
    const date = toIsoDay(timestamp);
    const existing = byDay.get(date) ?? { date, sessions: 0, questions: 0, correct: 0, hasDaily: false };
    existing.sessions += 1;
    existing.questions += summary.total;
    existing.correct += summary.correct;
    byDay.set(date, existing);
  }
  const activeDays = new Set(byDay.keys());
  return {
    today,
    activity: Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date)),
    currentStreak: currentStreak(activeDays, today),
    longestStreak: longestStreak(activeDays),
    totalSessions: summaries.length,
  };
}
