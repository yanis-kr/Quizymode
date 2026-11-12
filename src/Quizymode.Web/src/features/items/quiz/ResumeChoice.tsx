import { describeResumeEntry, type StoredResumeEntry } from "./resumeStorage";

interface ResumeChoiceProps {
  entry: StoredResumeEntry;
  onResume: () => void;
  onStartOver: () => void;
  /** "home" renders on the dark home panel; "page" on the light study page. */
  variant: "home" | "page";
  busy?: boolean;
}

/** Compact Resume / Start over choice for a saved unfinished run (AC 3.6.24). Single column below `sm`. */
export function ResumeChoice({ entry, onResume, onStartOver, variant, busy = false }: ResumeChoiceProps) {
  const home = variant === "home";
  const headingId = `resume-choice-${variant}`;
  return (
    <section
      aria-labelledby={headingId}
      className={
        home
          ? "rounded-[24px] border border-on-panel/12 bg-on-panel/8 p-3 shadow-xl shadow-slate-950/25 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:px-5"
          : "mx-auto my-6 max-w-xl rounded-lg border border-indigo-200 bg-surface p-4 shadow sm:p-5"
      }
    >
      <div className="min-w-0">
        <h2 id={headingId} className={home ? "text-sm font-semibold text-on-panel" : "text-lg font-semibold text-gray-900"}>
          {home ? "Continue studying" : "Pick up where you left off?"}
        </h2>
        <p className={`mt-1 break-words text-sm font-medium ${home ? "text-on-panel" : "text-gray-800"}`}>{entry.label}</p>
        <p className={`mt-0.5 text-xs ${home ? "text-on-panel-muted" : "text-gray-600"}`}>{describeResumeEntry(entry)}</p>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:mt-0 sm:flex-row sm:shrink-0">
        <button
          type="button"
          onClick={onResume}
          disabled={busy}
          className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {busy ? "Resuming…" : "Resume"}
        </button>
        <button
          type="button"
          onClick={onStartOver}
          disabled={busy}
          className={
            home
              ? "inline-flex min-h-[44px] items-center justify-center rounded-md border border-on-panel/20 bg-transparent px-4 py-2 text-sm font-semibold text-on-panel hover:bg-on-panel/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 disabled:opacity-60"
              : "inline-flex min-h-[44px] items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-60"
          }
        >
          Start over
        </button>
      </div>
    </section>
  );
}
