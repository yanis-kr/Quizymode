import { Link } from "react-router-dom";
import type { LandingLoadState } from "@/hooks/useScopeLanding";

export type LandingGamesState = "loading" | "available" | "unavailable";

export interface ScopeLandingHeaderProps {
  title: string;
  description?: string | null;
  /** Unfiltered number of questions in the scope. */
  count: number | undefined;
  countState: LandingLoadState;
  /**
   * A collection with 10 or more questions gets Play 5, Play 10 and Play all (N) (#714), plus Flashcards and Games.
   * A category scope offers those two in the mode tabs only (#896).
   */
  variant?: "scope" | "collection";
  /** Quiz route; a size is added to the query for Play 5 / Play 10 only. */
  quizHref: (size?: number) => string;
  /** Collection variant only. */
  flashcardsHref?: string;
  /** Collection variant only. */
  gamesHref?: string;
  /** Collection variant only. */
  games?: LandingGamesState;
  /** Timed run (mode=test) for exam scopes; undefined hides the Exam simulation button (#714). */
  examSimulationHref?: string;
  /** Exam scopes show the unofficial-practice line (#714). */
  unofficial?: boolean;
  browseHref?: string;
  /**
   * Known-item count (#672, #685); undefined hides the progress line (unknown set, loading or failed). A category
   * scope also hides it while nothing is known (#896).
   */
  knownCount?: number;
}

type Action =
  | { kind: "link"; key: string; label: string; href: string; primary: boolean }
  | { kind: "skeleton"; key: string };

/** Approved wording for exam scopes (#710 M1). */
export const UNOFFICIAL_PRACTICE_LINE = "Unofficial practice questions. Not affiliated with the exam provider.";

const BASE_LINK =
  "inline-flex min-h-[44px] items-center justify-center rounded-md px-4 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-indigo-500";
const PRIMARY_LINK = `${BASE_LINK} bg-indigo-600 text-white hover:bg-indigo-700`;
const OUTLINE_LINK = `${BASE_LINK} border border-gray-300 text-gray-700 hover:bg-gray-50`;

function buildActions(props: ScopeLandingHeaderProps): Action[] {
  const { count, countState, games, variant = "scope", quizHref, flashcardsHref, gamesHref, examSimulationHref } = props;
  const actions: Action[] = [];
  if (countState === "ready" && count !== undefined) {
    // Collections below 10 questions keep one Play quiz button (#714 AC4 starts at 10).
    if (count < 5 || (variant === "collection" && count < 10)) {
      actions.push({ kind: "link", key: "play", label: `Play quiz (${count})`, href: quizHref(), primary: true });
    } else {
      actions.push({ kind: "link", key: "play5", label: "Play 5", href: quizHref(5), primary: true });
      if (count >= 10) actions.push({ kind: "link", key: "play10", label: "Play 10", href: quizHref(10), primary: false });
      if (variant === "collection" && count >= 10) {
        actions.push({ kind: "link", key: "playAll", label: `Play all (${count})`, href: quizHref(), primary: false });
      }
    }
  }
  if (examSimulationHref) {
    actions.push({ kind: "link", key: "exam", label: "Exam simulation", href: examSimulationHref, primary: false });
  }
  if (variant === "collection") {
    if (flashcardsHref) actions.push({ kind: "link", key: "flashcards", label: "Flashcards", href: flashcardsHref, primary: false });
    if (games === "available" && gamesHref) actions.push({ kind: "link", key: "games", label: "Games", href: gamesHref, primary: false });
    else if (games === "loading") actions.push({ kind: "skeleton", key: "games" });
  }
  return actions;
}

/** "N of M known" line, or a completed state when every item is known (#672). */
export function SetProgress({ known, total, className = "mt-1 text-xs" }: { known: number; total: number; className?: string }) {
  const shown = Math.min(known, total);
  const complete = total > 0 && shown >= total;
  return complete ? (
    <p className={`${className} font-semibold text-emerald-700`} data-testid="set-progress" data-complete="true">
      Completed: all {total.toLocaleString()} known
    </p>
  ) : (
    <p className={`${className} text-gray-600`} data-testid="set-progress" data-complete="false">
      {shown.toLocaleString()} of {total.toLocaleString()} known
    </p>
  );
}

/**
 * Landing header of a set (category scope or collection): one h1, a one-line description, the question count and
 * the Play buttons (#646). Rendered above the mode tabs; the tabs stay as they are.
 */
export function ScopeLandingHeader(props: ScopeLandingHeaderProps) {
  const { title, description, count, countState, variant = "scope", browseHref = "/categories", knownCount, unofficial, examSimulationHref } = props;
  const isEmpty = countState === "ready" && count === 0;
  const actions = isEmpty || countState === "loading" ? [] : buildActions(props);
  const firstSpansTwo = actions.length % 2 === 1;
  const showKnown = knownCount !== undefined && (variant === "collection" || knownCount > 0);
  // A category scope whose count failed has no buttons unless it is an exam scope; the group is then left out.
  const showActionGroup = countState === "loading" || actions.length > 0;
  const loadingSlots = variant === "collection" ? [0, 1, 2, 3] : [0, 1];

  return (
    <div className="pb-3" aria-busy={countState === "loading"} data-testid="scope-landing-header" data-variant={variant}>
      <h1 className="break-words text-2xl font-semibold text-gray-900 sm:text-3xl">{title}</h1>
      {description ? (
        <p className="mt-1 line-clamp-2 text-sm text-gray-600 sm:line-clamp-none">{description}</p>
      ) : null}
      {unofficial ? <p className="mt-1 text-xs text-gray-500">{UNOFFICIAL_PRACTICE_LINE}</p> : null}
      {countState === "ready" && count !== undefined && (
        <p className="mt-1 text-xs text-gray-500">
          {count.toLocaleString()} {count === 1 ? "question" : "questions"}
        </p>
      )}
      {countState === "ready" && count !== undefined && count > 0 && showKnown && (
        <SetProgress known={knownCount} total={count} />
      )}
      {countState === "error" && <p className="mt-1 text-xs text-gray-500">Could not load the question count.</p>}
      {isEmpty ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-gray-600">No questions here yet.</p>
          <Link to={browseHref} className={OUTLINE_LINK}>
            Browse categories
          </Link>
        </div>
      ) : showActionGroup ? (
        <div role="group" aria-label="Play this set" className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {countState === "loading" &&
            loadingSlots.map((i) => (
              <div key={i} aria-hidden="true" className="h-11 animate-pulse rounded-md bg-gray-100 sm:w-28" />
            ))}
          {actions.map((action, index) => {
            const span = firstSpansTwo && index === 0 ? "col-span-2 sm:col-span-1" : "";
            if (action.kind === "skeleton") {
              return <div key={action.key} aria-hidden="true" className={`h-11 animate-pulse rounded-md bg-gray-100 sm:w-28 ${span}`} />;
            }
            return (
              <Link key={action.key} to={action.href} className={`${action.primary ? PRIMARY_LINK : OUTLINE_LINK} ${span}`}>
                {action.label}
              </Link>
            );
          })}
        </div>
      ) : null}
      {!isEmpty && examSimulationHref ? (
        <p className="mt-1 text-xs text-gray-500">Timed. Answers shown at the end.</p>
      ) : null}
    </div>
  );
}
