import type { LandingPageResponse } from "@/api/admin";

interface LandingPagesTableProps {
  landingPages: LandingPageResponse[];
}

/**
 * Where visitors arrive, and how often they leave without going anywhere else.
 * A high bounce rate on one entry path points at that page, not at traffic quality.
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
              Entry page
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
            <tr key={landing.path}>
              <td className="max-w-xs break-all py-3 pr-4 text-sm font-medium text-slate-900">
                {landing.path}
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
