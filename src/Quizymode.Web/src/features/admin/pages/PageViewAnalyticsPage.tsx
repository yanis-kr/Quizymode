import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import {
  adminApi,
  type PageViewVisitorType,
  type TopPageAnalyticsResponse,
} from "@/api/admin";
import ErrorMessage from "@/components/ErrorMessage";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useAuth } from "@/contexts/AuthContext";

const RANGE_OPTIONS: Array<{ label: string; days: number }> = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

const VISITOR_OPTIONS: Array<{ label: string; value: PageViewVisitorType }> = [
  { label: "All traffic", value: "all" },
  { label: "Authenticated", value: "authenticated" },
  { label: "Anonymous", value: "anonymous" },
];

const PAGE_SIZE = 25;
const TOP_PAGES_LIMIT = 10;

const PageViewAnalyticsPage = () => {
  const { isAuthenticated, isAdmin } = useAuth();
  const [days, setDays] = useState(7);
  const [visitorType, setVisitorType] = useState<PageViewVisitorType>("all");
  const [pathInput, setPathInput] = useState("");
  const [pathContains, setPathContains] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: [
      "admin",
      "page-view-analytics",
      days,
      visitorType,
      pathContains,
      page,
    ],
    queryFn: () =>
      adminApi.getPageViewAnalytics(
        days,
        visitorType,
        pathContains || undefined,
        page,
        PAGE_SIZE,
        TOP_PAGES_LIMIT
      ),
    enabled: !!isAuthenticated && !!isAdmin,
  });

  if (!isAuthenticated || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <ErrorMessage
        message="Failed to load usage analytics"
        onRetry={() => refetch()}
      />
    );
  }

  const summary = data?.summary;
  const maxTopPageViews = data?.topPages[0]?.totalViews ?? 0;

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPathContains(pathInput.trim());
    setPage(1);
  };

  const clearFilters = () => {
    setDays(7);
    setVisitorType("all");
    setPathInput("");
    setPathContains("");
    setPage(1);
  };

  const formatDateTime = (value: string) =>
    new Date(value).toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short",
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            to="/admin"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
          >
            ← Admin Dashboard
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-gray-900">
            Usage Analytics
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            Review which SPA URLs were visited, split by anonymous vs authenticated
            traffic, and inspect recent hits with session IDs and IP addresses.
          </p>
        </div>
        {summary && (
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
            Window: {formatDateTime(summary.windowStartUtc)} to{" "}
            {formatDateTime(summary.windowEndUtc)}
          </div>
        )}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div>
              <div className="text-sm font-medium text-gray-700">Time range</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {RANGE_OPTIONS.map((option) => (
                  <button
                    key={option.days}
                    type="button"
                    onClick={() => {
                      setDays(option.days);
                      setPage(1);
                    }}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                      days === option.days
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-sm font-medium text-gray-700">Visitor type</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {VISITOR_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setVisitorType(option.value);
                      setPage(1);
                    }}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                      visitorType === option.value
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <form onSubmit={handleSearchSubmit} className="flex w-full flex-col gap-3 lg:max-w-xl">
            <label className="text-sm font-medium text-gray-700" htmlFor="pathFilter">
              Filter by path
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="pathFilter"
                value={pathInput}
                onChange={(event) => setPathInput(event.target.value)}
                placeholder="Example: /categories or /admin"
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Reset
              </button>
            </div>
            {isFetching && (
              <div className="text-xs text-slate-500">Refreshing report…</div>
            )}
          </form>
        </div>
      </section>

      {summary && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Total page hits"
            value={summary.totalPageViews}
            detail={`${summary.uniquePages} unique pages`}
          />
          <MetricCard
            label="Unique sessions"
            value={summary.uniqueSessions}
            detail={`${summary.authenticatedSessions} authenticated / ${summary.anonymousSessions} anonymous`}
          />
          <MetricCard
            label="Authenticated hits"
            value={summary.authenticatedPageViews}
            detail="Signed-in traffic"
          />
          <MetricCard
            label="Anonymous hits"
            value={summary.anonymousPageViews}
            detail="Not signed in"
          />
          <MetricCard
            label="Most recent page"
            value={data?.recentPageViews[0]?.path ?? "No hits"}
            detail={
              data?.recentPageViews[0]
                ? formatDateTime(data.recentPageViews[0].createdUtc)
                : "Nothing recorded in this window"
            }
            compact
          />
        </section>
      )}

      <section className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Most Visited Pages
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                Ranked by total hits for the selected time window.
              </p>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Top {TOP_PAGES_LIMIT}
            </div>
          </div>

          {data && data.topPages.length > 0 ? (
            <div className="mt-5 space-y-4">
              {data.topPages.map((pageData, index) => (
                <TopPageRow
                  key={pageData.path}
                  index={index}
                  pageData={pageData}
                  maxViews={maxTopPageViews}
                  formatDateTime={formatDateTime}
                />
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              No page hits matched the current filters.
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Traffic Mix</h2>
          <p className="mt-1 text-sm text-gray-600">
            Compare signed-in and anonymous activity across the selected window.
          </p>

          {summary && summary.totalPageViews > 0 ? (
            <div className="mt-5 space-y-5">
              <VisitorMixBar
                label="Authenticated"
                value={summary.authenticatedPageViews}
                total={summary.totalPageViews}
                colorClass="bg-emerald-500"
              />
              <VisitorMixBar
                label="Anonymous"
                value={summary.anonymousPageViews}
                total={summary.totalPageViews}
                colorClass="bg-amber-500"
              />
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                Session coverage is split across {summary.authenticatedSessions} authenticated
                sessions and {summary.anonymousSessions} anonymous sessions.
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              No traffic recorded in this range yet.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Recent URL Hits</h2>
          <p className="mt-1 text-sm text-gray-600">
            Latest tracked page hits with visitor identity, session, and IP detail.
          </p>
        </div>

        {data && data.recentPageViews.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Time
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      URL
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Visitor
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Session / IP
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {data.recentPageViews.map((pageView) => (
                    <tr key={pageView.id} className="align-top hover:bg-slate-50">
                      <td className="px-5 py-4 text-sm text-slate-700">
                        {formatDateTime(pageView.createdUtc)}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-900">
                        <div className="max-w-md break-all font-medium">
                          {pageView.url}
                        </div>
                        {pageView.queryString && (
                          <div className="mt-1 text-xs text-slate-500">
                            Path: {pageView.path}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-700">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            pageView.isAuthenticated
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {pageView.isAuthenticated ? "Authenticated" : "Anonymous"}
                        </span>
                        <div className="mt-2 text-xs text-slate-500">
                          {pageView.userEmail || "No user email"}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-700">
                        <div className="font-mono text-xs text-slate-800">
                          {pageView.sessionId}
                        </div>
                        <div className="mt-2 font-mono text-xs text-slate-500">
                          {pageView.ipAddress}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-600">
                Page {data.page} of {Math.max(data.totalPages, 1)} with {data.totalCount} tracked hits
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={data.page <= 1}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPage((current) =>
                      data.totalPages > 0 ? Math.min(data.totalPages, current + 1) : 1
                    )
                  }
                  disabled={data.totalPages === 0 || data.page >= data.totalPages}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="px-5 py-10 text-center text-sm text-slate-500">
            No recent page hits matched the current filters.
          </div>
        )}
      </section>
    </div>
  );
};

interface MetricCardProps {
  label: string;
  value: number | string;
  detail: string;
  compact?: boolean;
}

const MetricCard = ({ label, value, detail, compact = false }: MetricCardProps) => {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div
        className={`mt-3 font-semibold text-slate-900 ${
          compact ? "text-xl break-words" : "text-3xl"
        }`}
      >
        {value}
      </div>
      <div className="mt-2 text-sm text-slate-600">{detail}</div>
    </div>
  );
};

interface VisitorMixBarProps {
  label: string;
  value: number;
  total: number;
  colorClass: string;
}

const VisitorMixBar = ({
  label,
  value,
  total,
  colorClass,
}: VisitorMixBarProps) => {
  const percent = total === 0 ? 0 : Math.round((value / total) * 100);

  return (
    <div>
      <div className="flex items-center justify-between text-sm text-slate-700">
        <span className="font-medium">{label}</span>
        <span>
          {value} hits ({percent}%)
        </span>
      </div>
      <div className="mt-2 h-3 rounded-full bg-slate-100">
        <div
          className={`h-3 rounded-full ${colorClass}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};

interface TopPageRowProps {
  index: number;
  pageData: TopPageAnalyticsResponse;
  maxViews: number;
  formatDateTime: (value: string) => string;
}

const TopPageRow = ({
  index,
  pageData,
  maxViews,
  formatDateTime,
}: TopPageRowProps) => {
  const percent = maxViews === 0 ? 0 : Math.round((pageData.totalViews / maxViews) * 100);

  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
            {index + 1}
          </div>
          <div>
            <div className="break-all font-semibold text-slate-900">{pageData.path}</div>
            <div className="mt-1 text-sm text-slate-500">
              {pageData.uniqueSessions} sessions, last hit {formatDateTime(pageData.lastVisitedUtc)}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold text-slate-900">
            {pageData.totalViews}
          </div>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            total hits
          </div>
        </div>
      </div>

      <div className="mt-4 h-2 rounded-full bg-slate-100">
        <div
          className="h-2 rounded-full bg-indigo-600"
          style={{ width: `${Math.max(percent, pageData.totalViews > 0 ? 8 : 0)}%` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-800">
          {pageData.authenticatedViews} authenticated
        </span>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">
          {pageData.anonymousViews} anonymous
        </span>
      </div>
    </div>
  );
};

export default PageViewAnalyticsPage;
