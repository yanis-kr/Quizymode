import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/solid";
import { STARTER_POOL_QUERY_KEY, starterApi } from "@/api/starter";
import { AboutExternalLink, AboutSection } from "./AboutSection";
import { aboutBodyClass, aboutLinkClass, aboutPrimaryCtaClass, aboutSecondaryCtaClass } from "./aboutStyles";
import { hookQuestionsFrom, pickAnotherId, seededIndex, shuffleOptions, sourceHost } from "./aboutHook";

interface Choice {
  id: string;
  seed: number;
}

/**
 * Section 2 of `/about` (#884): one text-only starter-pool question answered in place. Nothing is stored and no analytics
 * event is sent. The pool is shared with `/start` through the same query key; the request starts after first paint.
 */
export const AboutHookQuestion = () => {
  const [ready, setReady] = useState(false);
  const [initialSeed] = useState<number>(() => Math.random());
  const [choice, setChoice] = useState<Choice | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const questionRef = useRef<HTMLParagraphElement>(null);
  const focusQuestionNext = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const query = useQuery({
    queryKey: STARTER_POOL_QUERY_KEY,
    queryFn: () => starterApi.getPool(),
    retry: 0,
    staleTime: 5 * 60 * 1000,
    enabled: ready,
  });

  const settled = query.data !== undefined || query.isError;
  const questions = useMemo(() => (settled ? hookQuestionsFrom(query.data?.items) : []), [settled, query.data]);
  const current =
    (choice ? questions.find((question) => question.id === choice.id) : undefined) ??
    (questions.length > 0 ? questions[seededIndex(initialSeed, questions.length)] : undefined);
  const optionSeed = choice?.seed ?? initialSeed;
  const options = useMemo(() => (current ? shuffleOptions(current.options, optionSeed) : []), [current, optionSeed]);

  useEffect(() => {
    if (picked !== null) resultRef.current?.focus();
  }, [picked]);

  useEffect(() => {
    if (!focusQuestionNext.current) return;
    focusQuestionNext.current = false;
    questionRef.current?.focus();
  }, [current?.id]);

  const isCorrect = current !== undefined && picked === current.correctAnswer;
  const canShowAnother = current !== undefined && questions.length > 1;

  const handleAnother = () => {
    if (!current) return;
    const nextId = pickAnotherId(questions, current.id, Math.random());
    if (!nextId) return;
    focusQuestionNext.current = true;
    setPicked(null);
    setChoice({ id: nextId, seed: Math.random() });
  };

  return (
    <AboutSection id="about-hook" title="Here's one. Nobody is keeping score.">
      <div className="mt-3 min-h-[20rem] rounded-xl border border-slate-200 bg-surface p-3" data-testid="about-hook">
        {!current ? (
          <div role="status" aria-label="Loading a sample question" className="flex flex-col gap-2">
            <div aria-hidden="true" className="h-5 w-3/4 rounded bg-slate-200 motion-safe:animate-pulse" />
            {[0, 1, 2, 3].map((n) => (
              <div key={n} aria-hidden="true" className="h-11 rounded-lg bg-slate-100 motion-safe:animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <p
              ref={questionRef}
              tabIndex={-1}
              data-testid="about-hook-question"
              className="text-base font-semibold text-slate-900 focus:outline-none"
            >
              {current.question}
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {options.map((option) => {
                const answered = picked !== null;
                const isRight = option === current.correctAnswer;
                const isPick = option === picked;
                const tone = !answered
                  ? "border-slate-300 hover:border-indigo-400 hover:bg-slate-50"
                  : isRight
                    ? "border-green-500 bg-green-50"
                    : isPick
                      ? "border-red-500 bg-red-50"
                      : "border-slate-200 opacity-70";
                return (
                  <li key={option}>
                    <button
                      type="button"
                      onClick={() => setPicked(option)}
                      disabled={answered}
                      className={`flex min-h-[44px] w-full items-center gap-2 rounded-lg border-2 px-3 py-2 text-left text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${tone}`}
                    >
                      {answered && isRight && <CheckCircleIcon className="h-5 w-5 shrink-0 text-green-600" aria-hidden="true" />}
                      {answered && isPick && !isRight && <XCircleIcon className="h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />}
                      <span className="min-w-0 flex-1">{option}</span>
                      {answered && isRight && <span className="text-xs font-semibold text-green-800">Right answer</span>}
                      {answered && isPick && !isRight && <span className="text-xs font-semibold text-red-800">Your pick</span>}
                    </button>
                  </li>
                );
              })}
            </ul>

            {picked !== null && (
              <div ref={resultRef} tabIndex={-1} data-testid="about-hook-result" className="mt-3 focus:outline-none">
                <p className="text-sm font-semibold text-slate-900">
                  {isCorrect
                    ? "Correct. You are now slightly more fun at dinner."
                    : "Not quite. Now you know, which was the point."}
                </p>
                {current.explanation && <p className={aboutBodyClass}>{current.explanation}</p>}
                <p className="mt-1 text-sm text-slate-600">
                  Source:{" "}
                  <AboutExternalLink href={current.source} className={aboutLinkClass}>
                    {sourceHost(current.source)}
                  </AboutExternalLink>
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  {canShowAnother && (
                    <button type="button" onClick={handleAnother} className={aboutSecondaryCtaClass}>
                      Another one
                    </button>
                  )}
                  <Link to="/start" className={aboutPrimaryCtaClass}>
                    Play all 5
                  </Link>
                </div>
              </div>
            )}
          </>
        )}
        <p role="status" aria-live="polite" className="sr-only" data-testid="about-hook-announcement">
          {current && picked !== null
            ? `${isCorrect ? "Correct." : "Not quite."} The answer is ${current.correctAnswer}.`
            : ""}
        </p>
      </div>
    </AboutSection>
  );
};
