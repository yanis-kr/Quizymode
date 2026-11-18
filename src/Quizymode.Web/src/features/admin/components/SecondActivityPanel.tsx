import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/api/admin";
import type { SecondActivityBreakdown } from "@/api/admin";
import ErrorMessage from "@/components/ErrorMessage";
import LoadingSpinner from "@/components/LoadingSpinner";

const AREA_LABELS: Record<string, string> = {
  home: "Home",
  category: "Category landing",
  collection: "Collection landing",
  daily: "Daily",
  quiz: "Quiz",
  collections: "Collections",
  browse: "Browse",
  other: "Other",
};

interface SecondActivityPanelProps {
  days: number;
  includeBots: boolean;
  includeInternal?: boolean;
}

const formatPercent = (value: number | null) => (value === null ? "—" : `${value}%`);
const formatSeconds = (value: number | null) => (value === null ? "—" : `${Math.round(value)} s`);

const share = (part: number, whole: number) => (whole === 0 ? "—" : `${Math.round((part * 1000) / whole) / 10}%`);

const BreakdownCells = ({ breakdown, total }: { breakdown: SecondActivityBreakdown; total: number }) => (
  <>
    <td className="px-5 py-3 text-sm text-gray-700">{breakdown.sameScope} ({share(breakdown.sameScope, total)})</td>
    <td className="px-5 py-3 text-sm text-gray-700">{breakdown.otherTopic} ({share(breakdown.otherTopic, total)})</td>
    <td className="px-5 py-3 text-sm text-gray-700">{breakdown.sameTopicDifferentScope} ({share(breakdown.sameTopicDifferentScope, total)})</td>
    <td className="px-5 py-3 text-sm text-gray-700">{breakdown.unknown} ({share(breakdown.unknown, total)})</td>
  </>
);

/** Second-activity and cross-topic starts for sessions that finished a first activity (#715). */
const SecondActivityPanel = ({ days, includeBots, includeInternal = false }: SecondActivityPanelProps) => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin", "second-activity", days, includeBots, includeInternal],
    queryFn: () => adminApi.getSecondActivity(days, includeBots, includeInternal),
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <ErrorMessage message="Failed to load second activity" onRetry={() => refetch()} />;
  }

  if (!data) {
    return null;
  }

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-surface shadow-sm" aria-label="Second activity">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-lg font-semibold text-gray-900">Second activity</h2>
        <p className="mt-1 text-sm text-gray-600">
          Of {data.qualifyingSessions} session{data.qualifyingSessions === 1 ? "" : "s"} that finished a first
          activity, {data.secondStartedSessions} started another{" "}
          {data.ratesSuppressed ? "" : `(${formatPercent(data.secondStartedPercent)})`}. Median time to the first
          answer: {formatSeconds(data.medianSecondsToFirstAnswer)}.
        </p>
        {data.ratesSuppressed && data.note && <p className="mt-2 text-xs text-slate-500">{data.note}</p>}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Entry area</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Qualifying</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Started another</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Same scope</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Other topic</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Same topic, other scope</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Unknown</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.byEntryArea.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-4 text-sm text-gray-600">No sessions finished a first activity in this window.</td>
              </tr>
            )}
            {data.byEntryArea.map((row) => (
              <tr key={row.area}>
                <td className="px-5 py-3 text-sm text-gray-900">{AREA_LABELS[row.area] ?? row.area}</td>
                <td className="px-5 py-3 text-sm text-gray-700">{row.qualifyingSessions}</td>
                <td className="px-5 py-3 text-sm text-gray-700">{row.secondStartedSessions}</td>
                <BreakdownCells breakdown={row.second} total={row.secondStartedSessions} />
              </tr>
            ))}
            {data.byEntryArea.length > 0 && (
              <tr className="bg-slate-50">
                <td className="px-5 py-3 text-sm font-semibold text-gray-900">All areas</td>
                <td className="px-5 py-3 text-sm font-semibold text-gray-900">{data.qualifyingSessions}</td>
                <td className="px-5 py-3 text-sm font-semibold text-gray-900">{data.secondStartedSessions}</td>
                <BreakdownCells breakdown={data.second} total={data.secondStartedSessions} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default SecondActivityPanel;
