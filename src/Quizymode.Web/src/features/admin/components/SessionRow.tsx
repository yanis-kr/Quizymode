import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi, type PageViewSessionResponse } from "@/api/admin";
import {
  OUTCOME_BADGE_CLASSES,
  OUTCOME_LABELS,
  describeClient,
  formatDuration,
  shortenUserAgent,
} from "./sessionFormatting";

interface SessionRowProps {
  session: PageViewSessionResponse;
  formatDateTime: (value: string) => string;
}

const SessionRow = ({ session, formatDateTime }: SessionRowProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // The journey is only fetched once a row is actually opened, so the list
  // endpoint stays light no matter how many sessions are on screen.
  const {
    data: detail,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin", "page-view-session-detail", session.sessionId],
    // An internal row is only listed when internal traffic was requested, so the
    // detail lookup must opt in too or the API hides it.
    queryFn: () =>
      adminApi.getPageViewSessionDetail(session.sessionId, session.isInternal),
    enabled: isExpanded,
  });

  return (
    <>
      <tr className="align-top hover:bg-slate-50">
        <td className="px-5 py-4 text-sm text-slate-700">
          <button
            type="button"
            onClick={() => setIsExpanded((current) => !current)}
            aria-expanded={isExpanded}
            className="flex items-center gap-2 text-left font-medium text-indigo-600 hover:text-indigo-800"
          >
            <span aria-hidden="true">{isExpanded ? "▾" : "▸"}</span>
            {formatDateTime(session.startedUtc)}
          </button>
        </td>
        <td className="px-5 py-4 text-sm">
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
              OUTCOME_BADGE_CLASSES[session.outcome]
            }`}
          >
            {OUTCOME_LABELS[session.outcome]}
          </span>
          {session.isInternal && (
            <span className="ml-1.5 inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
              Internal
            </span>
          )}
          {session.userEmail && (
            <div className="mt-2 text-xs text-slate-500">{session.userEmail}</div>
          )}
        </td>
        <td className="px-5 py-4 text-sm text-slate-900">
          <div className="max-w-xs break-all font-medium">{session.entryPath}</div>
          {!session.isBounce && (
            <div className="mt-1 max-w-xs break-all text-xs text-slate-500">
              → {session.exitPath}
            </div>
          )}
        </td>
        <td className="px-5 py-4 text-sm text-slate-700">
          <div className="font-semibold text-slate-900">{session.pageHits}</div>
          <div className="mt-1 text-xs text-slate-500">
            {session.isBounce
              ? "bounced"
              : `${session.distinctPages} distinct`}
          </div>
        </td>
        <td className="px-5 py-4 text-sm text-slate-700">
          {formatDuration(session.durationSeconds)}
        </td>
        <td className="px-5 py-4 text-sm text-slate-700">
          <div className="font-mono text-xs text-slate-800">
            {session.ipAddress}
            {session.country && (
              <span className="ml-1.5 font-sans font-medium text-indigo-600">
                {session.country}
              </span>
            )}
          </div>
          <div
            className="mt-2 text-xs text-slate-500"
            title={session.userAgent ?? undefined}
          >
            {describeClient(session.userAgent, session.isBot)}
          </div>
        </td>
      </tr>

      {isExpanded && (
        <tr className="bg-slate-50">
          <td colSpan={6} className="px-5 py-4">
            {isLoading && (
              <div className="text-sm text-slate-500">Loading journey…</div>
            )}

            {error && (
              <div className="text-sm text-rose-600">
                Failed to load this session's journey.
              </div>
            )}

            {detail && (
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                  <span className="font-mono">{detail.sessionId}</span>
                  {detail.userAgent && (
                    <span className="break-all">
                      {shortenUserAgent(detail.userAgent)}
                    </span>
                  )}
                </div>

                <ol className="space-y-2">
                  {detail.steps.map((step) => (
                    <li
                      key={step.stepNumber}
                      className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                          {step.stepNumber}
                        </span>
                        <div className="min-w-0">
                          <div className="break-all text-sm font-medium text-slate-900">
                            {step.url}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {formatDateTime(step.createdUtc)}
                            {step.isAuthenticated && (
                              <span className="ml-2 font-medium text-emerald-700">
                                signed in
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 text-xs text-slate-600 sm:text-right">
                        {step.dwellSeconds === null ? (
                          // No exit event is recorded, so the final step's dwell
                          // time is genuinely unknown rather than zero.
                          <span className="italic text-slate-400">
                            last page — dwell unknown
                          </span>
                        ) : (
                          <>stayed {formatDuration(step.dwellSeconds)}</>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
};

export default SessionRow;
