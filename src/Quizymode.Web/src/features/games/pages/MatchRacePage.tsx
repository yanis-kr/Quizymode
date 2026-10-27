import { useEffect, useMemo, useRef, useState } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import { ScopeSecondaryBar } from "@/components/ScopeSecondaryBar";
import { createAnalyticsId } from "@/features/analytics/analyticsEvents";
import { celebratePerfectScore } from "@/features/items/quiz/celebrate";
import type { ItemResponse } from "@/types/api";
import { GAME_MIN_ITEMS, getMatchRaceTargetPairs } from "../gameRoster";
import { MATCH_RACE_ID } from "../gameRegistry";
import { buildGamePath, gameScopeKey } from "../gameScope";
import { trackGameCompleted, trackGameStarted } from "../gameAnalytics";
import { useGameRoster } from "../useGameRoster";
import { GamesEmptyState } from "../GamesEmptyState";
import { MatchTile, type MatchTileState } from "../matchRace/MatchTile";
import { MatchRaceFinish } from "../matchRace/MatchRaceFinish";
import { readBest, writeBestIfFaster } from "../matchRace/matchRaceBest";
import {
  createMatchRaceRun,
  formatGameTime,
  getElapsedMs,
  getFirstTryScore,
  reduceMatchRaceRun,
  type MatchRaceRunState,
  type MatchRaceTileKind,
} from "../matchRace/matchRaceRun";

const WRONG_CLEAR_MS = 600;
const TICK_MS = 100;

interface FinishResult {
  runId: string;
  elapsedMs: number;
  bestMs: number;
  isNewBest: boolean;
}

const MatchRacePage = () => {
  const { scope, pool, isPending, error, refetch, availableModes, handleModeChange, quizPath } = useGameRoster();
  const scopeKey: string = gameScopeKey(scope);

  // The board size is decided once, when a run is created, and never changes mid-run.
  const [runBox, setRunBox] = useState<{ scopeKey: string; state: MatchRaceRunState } | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [announcement, setAnnouncement] = useState("");
  const [finishResult, setFinishResult] = useState<FinishResult | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const finishHandledRunIds = useRef(new Set<string>());

  const run: MatchRaceRunState | null = runBox && runBox.scopeKey === scopeKey ? runBox.state : null;
  const itemsById = useMemo(() => new Map<string, ItemResponse>(pool.map((item) => [item.id, item])), [pool]);

  const startRun = () => {
    setRunBox({
      scopeKey,
      state: createMatchRaceRun(
        pool.map((item) => item.id),
        getMatchRaceTargetPairs(),
        createAnalyticsId(),
      ),
    });
    setAnnouncement("");
    setFinishResult(null);
  };

  // Create the first run (and one for a new scope) once the roster is known.
  useEffect(() => {
    if (run || isPending || error || pool.length < GAME_MIN_ITEMS) return;
    startRun();
    // startRun only reads values already in this dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, isPending, error, pool, scopeKey]);

  const runId: string | undefined = run?.runId;
  const status = run?.status;
  const startedAtMs = run?.startedAtMs ?? null;

  // game_started fires at the first tile selection.
  useEffect(() => {
    if (run && run.startedAtMs !== null) trackGameStarted(MATCH_RACE_ID, scope, run.runId, run.pairCount);
    // Only the run id and its start matter; scope and pair count are fixed for a run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, startedAtMs]);

  // Finish: report, store the best time, and announce, once per run.
  useEffect(() => {
    if (!run || run.status !== "finished" || finishHandledRunIds.current.has(run.runId)) return;
    finishHandledRunIds.current.add(run.runId);
    const elapsedMs: number = getElapsedMs(run, run.finishedAtMs ?? Date.now());
    trackGameCompleted(MATCH_RACE_ID, scope, run.runId, getFirstTryScore(run), run.pairCount);
    const result = writeBestIfFaster(scopeKey, run.pairCount, elapsedMs);
    setFinishResult({ runId: run.runId, elapsedMs, bestMs: result.best, isNewBest: result.isNewBest });
    setAnnouncement(`Done in ${formatGameTime(elapsedMs)}.${result.isNewBest ? " New best!" : ""}`);
    if (result.isNewBest) void celebratePerfectScore(run.runId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  // The clock ticks only while playing.
  useEffect(() => {
    if (status !== "playing") return;
    const id = window.setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [status, runId]);

  // A wrong pair clears itself; the next tap clears it sooner.
  const wrongPair = run?.wrongPair ?? null;
  useEffect(() => {
    if (!wrongPair) return;
    const id = window.setTimeout(() => {
      setRunBox((current) =>
        current ? { ...current, state: reduceMatchRaceRun(current.state, { type: "clear-wrong" }) } : current,
      );
    }, WRONG_CLEAR_MS);
    return () => window.clearTimeout(id);
  }, [wrongPair]);

  // Focus the heading on each new board.
  useEffect(() => {
    if (runId) headingRef.current?.focus();
  }, [runId]);

  const handleSelect = (kind: MatchRaceTileKind, itemId: string) => {
    if (!run) return;
    const now: number = Date.now();
    const next: MatchRaceRunState = reduceMatchRaceRun(run, { type: "select", kind, itemId, nowMs: now });
    if (next === run) return;
    setNowMs(now);
    setRunBox({ scopeKey, state: next });
    if (next.status === "finished") return; // announced by the finish effect
    if (next.clearedItemIds.length > run.clearedItemIds.length) {
      setAnnouncement(`Matched. ${next.clearedItemIds.length} of ${next.pairCount}.`);
    } else if (next.mistakes > run.mistakes) {
      setAnnouncement("Not a match. Plus 1 second.");
    } else if (next.selected) {
      setAnnouncement(next.selected.kind === "question" ? "Selected. Pick an answer." : "Selected. Pick a question.");
    } else {
      setAnnouncement("Cleared.");
    }
  };

  const scopeBar = (
    <ScopeSecondaryBar
      scopeType={scope.kind === "collection" ? "collection" : "category"}
      activeMode="games"
      availableModes={availableModes}
      onModeChange={handleModeChange}
    />
  );
  const liveRegion = (
    <div role="status" aria-live="polite" className="sr-only">
      {announcement}
    </div>
  );

  let body;
  if (error) {
    body = (
      <div role="alert" className="mx-auto mt-4 max-w-4xl">
        <ErrorMessage message="We couldn't load this game." onRetry={refetch} />
      </div>
    );
  } else if (!isPending && pool.length < GAME_MIN_ITEMS) {
    body = <GamesEmptyState quizPath={quizPath} />;
  } else if (!run) {
    body = <LoadingSpinner />;
  } else if (run.status === "finished") {
    const result: FinishResult =
      finishResult?.runId === run.runId
        ? finishResult
        : {
            runId: run.runId,
            elapsedMs: getElapsedMs(run, run.finishedAtMs ?? nowMs),
            bestMs: readBest(scopeKey, run.pairCount) ?? 0,
            isNewBest: false,
          };
    body = (
      <div className="mt-4">
        <MatchRaceFinish
          elapsedMs={result.elapsedMs}
          bestMs={result.bestMs}
          isNewBest={result.isNewBest}
          hubPath={buildGamePath(scope)}
          onPlayAgain={startRun}
        />
      </div>
    );
  } else {
    const tileState = (kind: MatchRaceTileKind, itemId: string): MatchTileState => {
      if (run.clearedItemIds.includes(itemId)) return "matched";
      const wrongId = kind === "question" ? run.wrongPair?.questionItemId : run.wrongPair?.answerItemId;
      if (wrongId === itemId) return "wrong";
      return run.selected?.kind === kind && run.selected.itemId === itemId ? "selected" : "idle";
    };
    const column = (kind: MatchRaceTileKind, label: string, order: string[]) => (
      <div>
        <div aria-hidden="true" className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
          {label}
        </div>
        <div role="group" aria-label={label} className="flex flex-col gap-2">
          {order.map((itemId) => {
            const item: ItemResponse | undefined = itemsById.get(itemId);
            if (!item) return null;
            return (
              <MatchTile
                key={itemId}
                text={kind === "question" ? item.question : item.correctAnswer}
                state={tileState(kind, itemId)}
                onSelect={() => handleSelect(kind, itemId)}
              />
            );
          })}
        </div>
      </div>
    );
    body = (
      <section className="mx-auto max-w-4xl rounded-lg bg-white p-4 shadow sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h1 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-gray-900 focus:outline-none">
            Match Race
          </h1>
          <p className="text-sm text-gray-700 tabular-nums">
            <span aria-label={`${run.clearedItemIds.length} of ${run.pairCount} matched`}>
              {run.clearedItemIds.length} / {run.pairCount}
            </span>{" "}
            · <span aria-hidden="true">{formatGameTime(getElapsedMs(run, Math.max(nowMs, run.startedAtMs ?? 0)))}</span>
          </p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-6">
          {column("question", "Questions", run.questionOrder)}
          {column("answer", "Answers", run.answerOrder)}
        </div>
      </section>
    );
  }

  return (
    <div className="py-3 sm:py-4">
      {scopeBar}
      {liveRegion}
      <div className={run && run.status !== "finished" && !error ? "mt-4" : undefined}>{body}</div>
    </div>
  );
};

export default MatchRacePage;
