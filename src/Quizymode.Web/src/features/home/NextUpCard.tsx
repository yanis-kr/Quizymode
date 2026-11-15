import { Link } from "react-router-dom";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { describeNextUp } from "./useNextUp";
import type { NextUpChoice } from "./nextUp";

/** Replaces the first-visit hero for a visitor who has completed a quiz (AC 3.31.1). */
export function NextUpCard({ choice }: { choice: NextUpChoice }) {
  const view = describeNextUp(choice);
  return (
    <section
      aria-labelledby="next-up-heading"
      data-testid="next-up-card"
      className="rounded-[24px] border border-on-panel/12 bg-on-panel/8 p-2 shadow-2xl shadow-slate-950/30 backdrop-blur sm:flex sm:items-center sm:justify-between sm:gap-6 sm:px-5 sm:py-3"
    >
      <div className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-ink">Next up</p>
        <h1 id="next-up-heading" className="mt-1 text-xl font-semibold tracking-tight text-on-panel sm:text-2xl">
          {view.title}
        </h1>
        <p className="mt-1 text-xs leading-5 text-on-panel-muted lg:text-sm">{view.detail}</p>
      </div>
      <div className="mt-3 flex shrink-0 flex-col items-stretch gap-2 sm:mt-0 sm:flex-row sm:items-center">
        <Link
          to={view.to}
          state={view.state}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#38bdf8_0%,#2563eb_100%)] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 transition hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:w-auto"
        >
          {view.action}
          <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
        </Link>
        <Link
          to="/games"
          className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-on-panel/25 bg-on-panel/10 px-6 py-2.5 text-sm font-semibold text-on-panel transition hover:bg-on-panel/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:w-auto"
        >
          Play a game
          <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
