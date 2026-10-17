import type { ContentScopeRow, ContentScopesResponse, FeatureAreaRow } from "@/api/admin";
import { formatArea } from "./sessionFormatting";

const EMPTY = (
  <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
    No page hits matched the current filters.
  </div>
);

const TH = "py-2 text-xs font-semibold uppercase tracking-wide text-slate-500";

/** Usage by feature (Quiz vs Flashcards vs Browse ...) instead of by raw URL (ANALYTICS-004). */
export const FeatureAreaTable = ({ rows }: { rows: FeatureAreaRow[] }) => {
  if (rows.length === 0) {
    return EMPTY;
  }

  return (
    <div className="mt-5 overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200">
        <thead>
          <tr>
            <th className={`${TH} text-left`}>Feature area</th>
            <th className={`${TH} text-right`}>Sessions</th>
            <th className={`${TH} text-right`}>Hits</th>
            <th className={`${TH} text-right`}>Share of sessions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.area}>
              <td className="py-3 pr-4 text-sm font-medium text-slate-900">
                {formatArea(row.area)}
              </td>
              <td className="py-3 text-right text-sm text-slate-700">{row.sessions}</td>
              <td className="py-3 text-right text-sm text-slate-700">{row.hits}</td>
              <td className="py-3 text-right text-sm text-slate-700">
                {row.sessionSharePercent}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-slate-500">
        A session can visit several areas, so shares can add up to more than 100%.
        Hits add up to the total page hits.
      </p>
    </div>
  );
};

const ScopeTable = ({
  title,
  keyLabel,
  rows,
  showName = false,
}: {
  title: string;
  keyLabel: string;
  rows: ContentScopeRow[];
  showName?: boolean;
}) => (
  <div>
    <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
    {rows.length === 0 ? (
      <div className="mt-2 text-sm text-slate-500">None in this window.</div>
    ) : (
      <div className="mt-2 overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead>
            <tr>
              <th className={`${TH} text-left`}>{keyLabel}</th>
              <th className={`${TH} text-right`}>Sessions</th>
              <th className={`${TH} text-right`}>Item steps</th>
              <th className={`${TH} text-right`}>Avg / session</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="max-w-xs break-all py-2 pr-4 text-sm text-slate-900">
                  {showName ? (
                    <>
                      <div className="font-medium">{row.name ?? "Unknown collection"}</div>
                      <div className="font-mono text-xs text-slate-500">{row.key}</div>
                    </>
                  ) : (
                    <span className="font-medium">{row.key}</span>
                  )}
                </td>
                <td className="py-2 text-right text-sm text-slate-700">{row.sessions}</td>
                <td className="py-2 text-right text-sm text-slate-700">{row.itemSteps}</td>
                <td className="py-2 text-right text-sm text-slate-700">
                  {row.avgItemStepsPerSession}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

/** Which categories, navigation sets, and collections get played (ANALYTICS-004). */
export const ContentScopeTables = ({ scopes }: { scopes: ContentScopesResponse }) => (
  <div className="mt-5 space-y-6">
    <ScopeTable title="Top categories" keyLabel="Category" rows={scopes.topCategories} />
    <ScopeTable title="Navigation sets" keyLabel="Category / keywords" rows={scopes.topNavPaths} />
    <ScopeTable title="Collections" keyLabel="Collection" rows={scopes.topCollections} showName />
  </div>
);
