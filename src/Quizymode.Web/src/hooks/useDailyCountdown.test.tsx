import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useDailyCountdown } from "./useDailyCountdown";

function Probe({ date }: { date?: string }) {
  const { text, isReady } = useDailyCountdown(date);
  return <p data-testid="out">{isReady ? "READY" : text}</p>;
}

describe("useDailyCountdown", () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("ticks down on minute boundaries and reaches the ready state without any refetch", () => {
    vi.setSystemTime(new Date("2026-10-18T23:57:30Z"));
    render(<Probe date="2026-10-18" />);
    expect(screen.getByTestId("out")).toHaveTextContent("2 min");
    act(() => {
      vi.advanceTimersByTime(30_001);
    });
    expect(screen.getByTestId("out")).toHaveTextContent("1 min");
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByTestId("out")).toHaveTextContent("less than a minute");
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByTestId("out")).toHaveTextContent("READY");
  });

  it("recomputes when the tab becomes visible again", () => {
    vi.setSystemTime(new Date("2026-10-18T18:48:00Z"));
    render(<Probe date="2026-10-18" />);
    expect(screen.getByTestId("out")).toHaveTextContent("5 h 12 min");
    // A sleeping tab: the clock jumps without timers firing.
    vi.setSystemTime(new Date("2026-10-18T23:30:00Z"));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByTestId("out")).toHaveTextContent("30 min");
  });

  it.each([{ label: "with the server date", date: "2026-10-19" }, { label: "without a date", date: undefined }])(
    "stays correct across local midnight in a non-UTC time zone ($label)",
    ({ date }) => {
      process.env.TZ = "America/Los_Angeles";
      // 23:30:30 on Oct 18 in Los Angeles (PDT, UTC-7); local midnight is 07:00Z, the quiz resets at 00:00Z the next day.
      vi.setSystemTime(new Date("2026-10-19T06:30:30Z"));
      render(<Probe {...(date ? { date } : {})} />);
      expect(screen.getByTestId("out")).toHaveTextContent("17 h 29 min");
      // One act per minute: the next timer is scheduled after each state update has rendered.
      for (let minute = 0; minute < 60; minute += 1) {
        act(() => {
          vi.advanceTimersByTime(60_000);
        });
      }
      expect(screen.getByTestId("out")).toHaveTextContent("16 h 29 min");
    },
  );

  it("never refetches or invalidates anything at zero (the hook has no query access)", () => {
    vi.setSystemTime(new Date("2026-10-18T23:59:50Z"));
    render(<Probe date="2026-10-18" />);
    act(() => {
      vi.advanceTimersByTime(11_000);
    });
    expect(screen.getByTestId("out")).toHaveTextContent("READY");
  });
});
