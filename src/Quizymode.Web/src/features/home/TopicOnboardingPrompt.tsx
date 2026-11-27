import { useId } from "react";
import { useTopicEditor } from "@/features/interests/topicEditorContext";
import type { useTopicOnboarding } from "./useTopicOnboarding";

/**
 * One-time "Make Home yours" card for signed-in visitors with no topics (#382). It never blocks: "Not now" hides it
 * at once (and for the page session even if saving the dismissal fails). When it shows is decided by
 * {@link useTopicOnboarding}.
 */
export function TopicOnboardingPrompt({ onboarding }: { onboarding: ReturnType<typeof useTopicOnboarding> }) {
  const topicEditor = useTopicEditor();
  const headingId = useId();
  if (onboarding.cardState !== "shown") return null;

  const dismiss = () => {
    // Move focus to the next control before the card disappears, so it never falls back to the page body.
    const next =
      document.querySelector<HTMLElement>('a[href="/daily"]') ??
      document.querySelector<HTMLElement>("main") ??
      document.querySelector<HTMLElement>("h1");
    if (next) {
      if (!next.matches("a,button,input,[tabindex]")) next.tabIndex = -1;
      next.focus();
    }
    onboarding.dismiss();
  };

  return (
    <section
      role="region"
      aria-labelledby={headingId}
      className="rounded-[24px] border border-sky-300/30 bg-sky-500/10 p-2 shadow-xl shadow-slate-950/25 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:p-3"
    >
      <div>
        <h2 id={headingId} className="text-sm font-semibold text-on-panel">Make Home yours</h2>
        <p className="mt-0.5 text-xs text-on-panel">
          Pick up to 10 topics and your Home puts them first. You can change them any time.
        </p>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:mt-0 sm:shrink-0 sm:flex-row">
        <button
          type="button"
          onClick={topicEditor.open}
          className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-sky-500 px-5 py-2 text-sm font-semibold text-[#020617] hover:bg-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
        >
          Choose topics
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-on-panel/20 px-5 py-2 text-sm font-semibold text-on-panel hover:bg-on-panel/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
        >
          Not now
        </button>
      </div>
    </section>
  );
}
