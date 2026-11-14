import { describe, expect, it } from "vitest";
import { formatCountdown, msUntilCountdownChanges, msUntilNextDaily, nextDailyResetAt } from "./dailyCountdown";

const at = (iso: string) => Date.parse(iso);

describe("dailyCountdown", () => {
  it("formats hours and minutes, minutes only, whole hours and under a minute", () => {
    expect(formatCountdown((5 * 60 + 12) * 60_000 + 30_000)).toBe("5 h 12 min");
    expect(formatCountdown(12 * 60_000)).toBe("12 min");
    expect(formatCountdown(3 * 3_600_000)).toBe("3 h");
    expect(formatCountdown(59_999)).toBe("less than a minute");
    expect(formatCountdown(0)).toBe("less than a minute");
  });

  it("never mentions UTC, a date or seconds", () => {
    for (const ms of [0, 5_000, 61_000, 3_700_000, 80_000_000]) {
      expect(formatCountdown(ms)).not.toMatch(/UTC|\d{4}-\d{2}|\bsec|\d+ s\b/i);
    }
  });

  it("counts down to the day after the server's date at 00:00Z", () => {
    expect(nextDailyResetAt(at("2026-10-18T18:48:00Z"), "2026-10-18")).toBe(at("2026-10-19T00:00:00Z"));
    expect(formatCountdown(msUntilNextDaily(at("2026-10-18T18:48:00Z"), "2026-10-18"))).toBe("5 h 12 min");
  });

  it("falls back to the next UTC midnight without a usable date", () => {
    expect(formatCountdown(msUntilNextDaily(at("2026-10-18T18:48:00Z")))).toBe("5 h 12 min");
    expect(formatCountdown(msUntilNextDaily(at("2026-10-18T18:48:00Z"), "not-a-date"))).toBe("5 h 12 min");
  });

  it("is zero or less once the server date has rolled over", () => {
    expect(msUntilNextDaily(at("2026-10-19T00:00:00Z"), "2026-10-18")).toBe(0);
    expect(msUntilNextDaily(at("2026-10-19T00:00:05Z"), "2026-10-18")).toBeLessThan(0);
  });

  it("schedules the next tick at the next minute boundary, or at zero under a minute", () => {
    expect(msUntilCountdownChanges(5 * 3_600_000 + 12 * 60_000 + 10_000)).toBe(10_001);
    expect(msUntilCountdownChanges(30_000)).toBe(30_000);
    expect(msUntilCountdownChanges(0)).toBe(60_000);
  });
});
