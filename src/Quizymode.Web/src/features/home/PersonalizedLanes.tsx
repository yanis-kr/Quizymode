import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { useAuth } from "@/contexts/AuthContext";
import { collectionsApi } from "@/api/collections";
import type { FeaturedSetDto } from "@/api/featured";
import { dailyQuizApi, interestsApi, reviewQueueApi } from "@/api/learningLoop";
import { studySessionsApi } from "@/api/studySessions";
import { buildCategoryPath } from "@/utils/categorySlug";
import { getCategoryThemeBySlug } from "@/features/categories/categoryThemes";
import { readGuestHistory, readGuestRunSummary, GUEST_HISTORY_CHANGED_EVENT } from "@/features/guestHistory/guestHistoryStorage";
import { buildGuestPracticePath, describeGuestTopic } from "@/features/guestHistory/guestHistoryLinks";
import {
  LEARNING_STATE_CHANGED_EVENT,
  MAX_INTERESTS,
  computeStreak,
  readDailyCompletions,
  readLocalInterests,
  utcToday,
  writeLocalInterests,
} from "@/features/learningLoop/localLearningState";
import { DAILY_QUIZ_QUERY_KEY } from "@/features/learningLoop/pages/DailyQuizPage";
import { homeCategoryCards } from "./homePageData";
import { rankPersonalizedHome, type ActivityRun } from "./personalization";

const laneClass = "rounded-[24px] border border-white/10 bg-slate-950/70 p-2 sm:p-3 shadow-xl shadow-slate-950/25";
const eyebrowClass = "text-xs font-semibold uppercase tracking-[0.22em] text-sky-300";
const pillLinkClass =
  "inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200";
const categoryNames = new Map(homeCategoryCards.map((card) => [card.slug, card.name]));
const knownCategories = homeCategoryCards.map((card) => card.slug);

/** Bumps when browser-local learning state changes in this tab or another, so derived values re-read storage. */
function useLocalVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((current) => current + 1);
    const events = [LEARNING_STATE_CHANGED_EVENT, GUEST_HISTORY_CHANGED_EVENT, "storage"];
    events.forEach((name) => window.addEventListener(name, bump));
    return () => events.forEach((name) => window.removeEventListener(name, bump));
  }, []);
  return version;
}

function ContinueCard({ run }: { run: ActivityRun }) {
  const source = run.source!;
  const collectionId = source.kind === "collection" ? source.collectionId : null;
  const collection = useQuery({
    queryKey: ["home", "continue-collection", collectionId],
    queryFn: () => collectionsApi.getById(collectionId!),
    enabled: !!collectionId,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  // Unavailable collections are not offered (same rule as AC 3.0.16).
  if (source.kind === "collection" && collection.isError) return null;
  const label = source.kind === "collection" ? collection.data?.name ?? "Collection" : describeGuestTopic(source);
  return (
    <Link to={buildGuestPracticePath(source, run.mode)} className={pillLinkClass}>
      {label}
      <ArrowRightIcon className="h-3 w-3" aria-hidden="true" />
    </Link>
  );
}

function FeaturedCard({ set }: { set: FeaturedSetDto }) {
  const keywords = [set.navKeyword1, set.navKeyword2].filter(Boolean) as string[];
  return (
    <Link
      to={buildCategoryPath(set.categorySlug, keywords)}
      className="group relative min-w-0 shrink-0 basis-[calc(50%-0.3125rem)] overflow-hidden rounded-[18px] border border-white/10 bg-slate-900/90 transition duration-200 hover:-translate-y-0.5 hover:border-sky-300/50 md:basis-[calc((100%-0.833rem)/3)] xl:basis-[calc((100%-1.875rem)/4)]"
    >
      <img src={getCategoryThemeBySlug(set.categorySlug).image} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.05)_0%,rgba(2,6,23,0.78)_100%)]" />
      <div className="relative flex min-h-[80px] flex-col justify-between p-3 sm:min-h-[96px]">
        <span className="self-end rounded-full border border-white/20 bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white">
          {categoryNames.get(set.categorySlug) ?? set.categorySlug}
        </span>
        <h3 className="text-sm font-semibold text-white">{set.displayName}</h3>
      </div>
    </Link>
  );
}

/** Whether the saved topics are known yet. Saving is only allowed once they are, so a failed load never wipes them. */
type TopicPickerStatus = "loading" | "error" | "ready";

interface TopicPickerProps {
  initial: string[];
  status: TopicPickerStatus;
  saving: boolean;
  error: boolean;
  onSave: (categories: string[]) => void;
  retrying: boolean;
  onRetry: () => void;
  onClose: () => void;
}

function TopicPicker({ initial, status, saving, error, onSave, retrying, onRetry, onClose }: TopicPickerProps) {
  // null until the saved topics have loaded; then prefilled once with them.
  const [selected, setSelected] = useState<string[] | null>(status === "ready" ? initial : null);
  if (selected === null && status === "ready") setSelected(initial);
  const dialogRef = useRef<HTMLDivElement>(null);
  const full = (selected?.length ?? 0) >= MAX_INTERESTS;

  // The parent passes a new onClose each render; keep the mount-only effect below from re-running (and moving focus).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>("input,button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);

  // When the chips replace the loading or error state, move focus to the first chip.
  const chipsShown = selected !== null;
  const chipsWereShown = useRef(chipsShown);
  useEffect(() => {
    if (chipsShown && !chipsWereShown.current) dialogRef.current?.querySelector<HTMLElement>("fieldset input")?.focus();
    chipsWereShown.current = chipsShown;
  }, [chipsShown]);

  const toggle = (slug: string) =>
    setSelected((current) =>
      current === null ? current : current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug],
    );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="topic-picker-title"
        className="w-full max-w-lg rounded-2xl bg-slate-900 p-4 text-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="topic-picker-title" className="text-lg font-semibold">Choose your topics</h2>
        <p className="mt-1 text-xs text-slate-300">Pick up to {MAX_INTERESTS}. Your picks come first on the home page.</p>
        {selected === null && status === "loading" && (
          <div role="status" className="mt-3 flex flex-wrap gap-2">
            <span className="sr-only">Loading your topics…</span>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span key={i} aria-hidden="true" className="h-7 w-20 animate-pulse rounded-full bg-white/10" />
            ))}
          </div>
        )}
        {selected === null && status === "error" && (
          <div role="alert" className="mt-3 text-xs text-red-300">
            Your topics could not be loaded.{" "}
            <button type="button" onClick={onRetry} disabled={retrying} className="font-semibold underline disabled:opacity-60">
              {retrying ? "Retrying…" : "Retry"}
            </button>
          </div>
        )}
        {selected !== null && (
          <fieldset className="mt-3 flex flex-wrap gap-2">
            <legend className="sr-only">Topics</legend>
            {homeCategoryCards.map((card) => {
              const checked = selected.includes(card.slug);
              return (
                <label
                  key={card.slug}
                  className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-200 ${
                    checked ? "border-sky-300 bg-sky-500/30" : "border-white/20 bg-white/5"
                  } ${!checked && full ? "opacity-50" : ""}`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    disabled={!checked && full}
                    onChange={() => toggle(card.slug)}
                  />
                  {card.name}
                </label>
              );
            })}
          </fieldset>
        )}
        {error && (
          <p role="alert" className="mt-3 text-xs text-red-300">Your topics could not be saved. Try again.</p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold hover:bg-white/10">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (selected !== null) onSave(selected);
            }}
            disabled={saving || selected === null}
            className="rounded-full bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save topics"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Personalized home lanes (epic #197): today's daily quiz and review, Continue (signed in), For you and Recommended
 * next (#116). Every query fails soft: a lane whose data is missing is simply not shown (AC 3.0.4).
 */
export function PersonalizedLanes({ featuredSets }: { featuredSets: FeaturedSetDto[] }) {
  const { isAuthenticated, isLoading: isAuthLoading, userId } = useAuth();
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const localVersion = useLocalVersion();
  const signedIn = isAuthenticated && !isAuthLoading;
  const identityKey = signedIn ? `user:${userId ?? "unknown"}` : "guest";

  const interestsQuery = useQuery({
    queryKey: ["home", "interests", userId],
    queryFn: () => interestsApi.get(),
    enabled: signedIn,
    retry: false,
  });
  const sessionsQuery = useQuery({
    queryKey: ["home", "sessions", userId],
    queryFn: () => studySessionsApi.list(20),
    enabled: signedIn,
    retry: false,
  });
  const reviewQuery = useQuery({
    queryKey: ["review-queue", "summary", userId],
    queryFn: () => reviewQueueApi.getSummary(),
    enabled: signedIn,
    retry: false,
  });
  const dailyQuery = useQuery({
    queryKey: [...DAILY_QUIZ_QUERY_KEY, identityKey],
    queryFn: () => dailyQuizApi.get(),
    enabled: signedIn,
    retry: false,
    staleTime: 60 * 1000,
  });
  const popularQuery = useQuery({
    queryKey: ["home", "popular-categories"],
    queryFn: () => interestsApi.popularCategories(),
    enabled: !isAuthLoading,
    retry: false,
    staleTime: 30 * 60 * 1000,
  });

  const saveInterests = useMutation({
    mutationFn: async (categories: string[]) => {
      if (signedIn) return interestsApi.replace(categories);
      if (!writeLocalInterests(categories)) throw new Error("Storage unavailable");
      return categories;
    },
    onSuccess: (categories) => {
      queryClient.setQueryData(["home", "interests", userId], categories);
      setPickerOpen(false);
    },
  });

  const pickerStatus: TopicPickerStatus = !signedIn
    ? "ready"
    : interestsQuery.isSuccess
      ? "ready"
      : interestsQuery.isError
        ? "error"
        : "loading";

  const explicitInterests = useMemo(
    () => (signedIn ? interestsQuery.data ?? [] : readLocalInterests()),
    // localVersion re-reads browser storage after a change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signedIn, interestsQuery.data, localVersion],
  );
  const runs = useMemo<ActivityRun[]>(() => {
    if (signedIn) {
      return (sessionsQuery.data ?? [])
        .map((session) => readGuestRunSummary(session))
        .filter((summary): summary is NonNullable<typeof summary> => summary !== null)
        .map((summary) => ({ completedAt: summary.completedAt, source: summary.source, mode: summary.mode }));
    }
    return isAuthLoading ? [] : readGuestHistory().map((summary) => ({ completedAt: summary.completedAt, source: summary.source, mode: summary.mode }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, isAuthLoading, sessionsQuery.data, localVersion]);

  const ranked = useMemo(
    () =>
      rankPersonalizedHome({
        explicitInterests,
        runs,
        featuredSets,
        popularCategories: popularQuery.data ?? [],
        knownCategories,
        categoryNames,
      }),
    [explicitInterests, runs, featuredSets, popularQuery.data],
  );

  const today = utcToday();
  const localDaily = signedIn ? [] : readDailyCompletions();
  const dailyDone = signedIn ? Boolean(dailyQuery.data?.completion) : localDaily.some((entry) => entry.date === today);
  const streak = signedIn ? dailyQuery.data?.streak ?? 0 : computeStreak(localDaily.map((entry) => entry.date), today);
  const review = signedIn ? reviewQuery.data : undefined;

  if (isAuthLoading) return null;

  return (
    <>
      <section className={laneClass} aria-labelledby="home-today-heading">
        <h2 id="home-today-heading" className={`${eyebrowClass} mb-1.5`}>Today</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <Link
            to="/daily"
            className="flex items-center justify-between gap-3 rounded-[18px] border border-white/10 bg-gradient-to-br from-amber-500/20 to-rose-500/10 p-3 hover:border-amber-300/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
          >
            <span>
              <span className="block text-sm font-semibold text-white">Daily quiz</span>
              <span className="block text-xs text-slate-200">
                {dailyDone ? "Done for today. New set at midnight UTC." : "Five new questions, same for everyone today."}
              </span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-amber-200">
              {streak > 0 ? `🔥 ${streak}-day streak` : dailyDone ? "✓ Done" : "Play"}
            </span>
          </Link>
          {review && review.totalCount > 0 && (
            <Link
              to="/review"
              className="flex items-center justify-between gap-3 rounded-[18px] border border-white/10 bg-gradient-to-br from-indigo-500/20 to-sky-500/10 p-3 hover:border-sky-300/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
            >
              <span>
                <span className="block text-sm font-semibold text-white">Review mistakes</span>
                <span className="block text-xs text-slate-200">
                  {review.dueCount > 0
                    ? `${review.dueCount} ${review.dueCount === 1 ? "question" : "questions"} due`
                    : "Nothing due right now"}
                </span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-sky-200">{review.dueCount > 0 ? "Review" : "Later"}</span>
            </Link>
          )}
        </div>
      </section>

      {signedIn && ranked.continueRuns.length > 0 && (
        <section className={laneClass} aria-labelledby="home-continue-heading">
          <h2 id="home-continue-heading" className={`${eyebrowClass} mb-1.5`}>Continue</h2>
          <div className="flex flex-wrap gap-2">
            {ranked.continueRuns.map((run) => (
              <ContinueCard key={`${run.completedAt}:${run.source?.kind}`} run={run} />
            ))}
          </div>
        </section>
      )}

      <section className={laneClass} aria-labelledby="home-for-you-heading">
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <h2 id="home-for-you-heading" className={eyebrowClass}>For you</h2>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="text-xs font-semibold text-sky-400 hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
          >
            {explicitInterests.length > 0 ? "Edit topics" : "Choose topics"}
          </button>
        </div>
        {ranked.forYou.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {ranked.forYou.map((entry) => (
              <Link key={entry.slug} to={`/categories/${entry.slug}`} className={pillLinkClass}>
                {categoryNames.get(entry.slug) ?? entry.slug}
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-300">Choose a few topics and we'll put them first.</p>
        )}
        {ranked.recommended.length > 0 && (
          <>
            <h3 className="mt-3 mb-1.5 text-xs font-semibold text-slate-300">
              {ranked.isColdStart ? "Popular right now" : "Recommended next"}
            </h3>
            <div className="flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {ranked.recommended.map((set) => (
                <FeaturedCard key={set.id} set={set} />
              ))}
            </div>
          </>
        )}
      </section>

      {pickerOpen && (
        <TopicPicker
          initial={explicitInterests}
          status={pickerStatus}
          saving={saveInterests.isPending}
          error={saveInterests.isError}
          onSave={(categories) => saveInterests.mutate(categories)}
          retrying={interestsQuery.isFetching}
          onRetry={() => void interestsQuery.refetch()}
          onClose={() => {
            saveInterests.reset();
            setPickerOpen(false);
          }}
        />
      )}
    </>
  );
}
