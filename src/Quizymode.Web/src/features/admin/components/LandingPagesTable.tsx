import type { LandingPageResponse } from "@/api/admin";
import { formatArea, formatScope } from "./sessionFormatting";

interface LandingPagesTableProps {
  landingPages: LandingPageResponse[];
}

/**
 * Where visitors arrive, grouped by feature area and content scope, and how often
 * they leave without going anywhere else. A high bounce rate on one entry group
 * points at that page, not at traffic quality.
 */
const LandingPagesTable = ({ landingPages }: LandingPagesTableProps) => {
  if (landingPages.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        No landing pages recorded in this range yet.
      </div>
    );
  }

  return (
    <div className="mt-5 overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200">
        <thead>
          <tr>
            <th className="py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Entry area / scope
            </th>
            <th className="py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
              Sessions
            </th>
            <th className="py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
              Bounce rate
            </th>
            <th className="py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
              Avg pages
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {landingPages.map((landing) => (
            <tr key={`${landing.area}|${landing.scopeType ?? ""}|${landing.scopeKey ?? ""}`}>
              <td className="max-w-xs break-all py-3 pr-4 text-sm text-slate-900">
                <div className="font-medium">
                  {formatArea(landing.area)}
                  {formatScope(landing.scopeType, landing.scopeKey) && (
                    <span className="ml-1.5 font-normal text-slate-600">
                      {formatScope(landing.scopeType, landing.scopeKey)}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  e.g. {landing.path}
                </div>
              </td>
              <td className="py-3 text-right text-sm text-slate-700">
                {landing.sessions}
              </td>
              <td className="py-3 text-right text-sm">
                <span
                  className={
                    landing.bounceRatePercent >= 70
                      ? "font-semibold text-rose-600"
                      : "text-slate-700"
                  }
                >
                  {landing.bounceRatePercent}%
                </span>
              </td>
              <td className="py-3 text-right text-sm text-slate-700">
                {landing.avgPagesPerSession}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default LandingPagesTable;
