import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminApi,
  type AdminUserActivityFilter,
  type AdminUserOverviewResponse,
} from "@/api/admin";
import { useAuth } from "@/contexts/AuthContext";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";

const STUDY_GUIDE_KEY = "StudyGuideMaxBytes";
const DEFAULT_MAX_BYTES = 51200;
const USERS_PAGE_SIZE = 12;
const URL_HISTORY_PAGE_SIZE = 12;

const RANGE_OPTIONS: Array<{ label: string; days: number }> = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "365d", days: 365 },
];

const ACTIVITY_FILTER_OPTIONS: Array<{
  label: string;
  value: AdminUserActivityFilter;
}> = [
  { label: "All users", value: "all" },
  { label: "With activity", value: "with-activity" },
  { label: "No activity", value: "without-activity" },
];

const AdminUserSettingsPage = () => {
  const { isAuthenticated, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [activityDays, setActivityDays] = useState(30);
  const [activityFilter, setActivityFilter] =
    useState<AdminUserActivityFilter>("all");
  const [usersPage, setUsersPage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [historyDays, setHistoryDays] = useState(30);
  const [urlFilterInput, setUrlFilterInput] = useState("");
  const [urlFilter, setUrlFilter] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [studyGuideBytes, setStudyGuideBytes] = useState("");

  const {
    data: usersData,
    isLoading: isUsersLoading,
    isFetching: isUsersFetching,
    error: usersError,
    refetch: refetchUsers,
  } = useQuery({
    queryKey: [
      "admin",
      "users",
      search,
      activityDays,
      activityFilter,
      usersPage,
    ],
    queryFn: () =>
      adminApi.getUsers(
        search || undefined,
        activityDays,
        activityFilter,
        usersPage,
        USERS_PAGE_SIZE
      ),
    enabled: !!isAuthenticated && !!isAdmin,
  });

  useEffect(() => {
    const users = usersData?.users ?? [];
    if (users.length === 0) {
      setSelectedUserId(null);
      return;
    }

    if (!selectedUserId || !users.some((user) => user.id === selectedUserId)) {
      setSelectedUserId(users[0].id);
    }
  }, [selectedUserId, usersData]);

  const selectedUserFromList =
    usersData?.users.find((user) => user.id === selectedUserId) ?? null;

  const {
    data: activityData,
    isLoading: isActivityLoading,
    isFetching: isActivityFetching,
    error: activityError,
    refetch: refetchActivity,
  } = useQuery({
    queryKey: [
      "admin",
      "user-activity",
      selectedUserId,
      historyDays,
      urlFilter,
      historyPage,
    ],
    queryFn: () =>
      adminApi.getUserActivity(
        selectedUserId!,
        historyDays,
        urlFilter || undefined,
        historyPage,
        URL_HISTORY_PAGE_SIZE
      ),
    enabled: !!isAuthenticated && !!isAdmin && !!selectedUserId,
  });

  const {
    data: settingsData,
    isLoading: isSettingsLoading,
    error: settingsError,
    refetch: refetchSettings,
  } = useQuery({
    queryKey: ["admin", "user-settings", selectedUserId],
    queryFn: () => adminApi.getUserSettings(selectedUserId!),
    enabled: !!isAuthenticated && !!isAdmin && !!selectedUserId,
  });

  useEffect(() => {
    const rawValue = settingsData?.settings[STUDY_GUIDE_KEY];
    setStudyGuideBytes(rawValue ?? "");
  }, [selectedUserId, settingsData]);

  const updateMutation = useMutation({
    mutationFn: async (value: string) => {
      if (!selectedUserId) {
        throw new Error("No user selected.");
      }

      return adminApi.updateUserSetting(selectedUserId, STUDY_GUIDE_KEY, value);
    },
    onSuccess: async () => {
      if (!selectedUserId) {
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: ["admin", "user-settings", selectedUserId],
      });
    },
  });

  if (!isAuthenticated || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (isUsersLoading) {
    return <LoadingSpinner />;
  }

  if (usersError) {
    return (
      <ErrorMessage
        message="Failed to load registered users"
        onRetry={() => refetchUsers()}
      />
    );
  }

  const users = usersData?.users ?? [];
  const usersSummary = usersData?.summary;
  const selectedUser = activityData?.user ?? null;

  const effectiveMaxBytes = (() => {
    const rawValue = studyGuideBytes.trim();
    if (rawValue === "") {
      return DEFAULT_MAX_BYTES;
    }

    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }

    if (parsed > 1_000_000) {
      return 1_000_000;
    }

    return Math.trunc(parsed);
  })();

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearch(searchInput.trim());
    setUsersPage(1);
  };

  const handleHistorySearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUrlFilter(urlFilterInput.trim());
    setHistoryPage(1);
  };

  const clearUserFilters = () => {
    setSearchInput("");
    setSearch("");
    setActivityDays(30);
    setActivityFilter("all");
    setUsersPage(1);
  };

  const selectUser = (user: AdminUserOverviewResponse) => {
    updateMutation.reset();
    setSelectedUserId(user.id);
    setHistoryDays(activityDays);
    setUrlFilterInput("");
    setUrlFilter("");
    setHistoryPage(1);
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) {
      return "Never";
    }

    return new Date(value).toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link
            to="/admin"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
          >
            ← Admin Dashboard
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-gray-900">
            Users and Activity
          </h1>
          <p className="mt-2 max-w-4xl text-sm text-gray-600">
            Review registered users, filter by recent activity, inspect the URLs
            each user opened, and adjust per-user study guide limits from the
            same admin workspace.
          </p>
        </div>
        {usersSummary && (
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
            Activity window: {formatDateTime(usersSummary.activityWindowStartUtc)} to{" "}
            {formatDateTime(usersSummary.activityWindowEndUtc)}
          </div>
        )}
      </div>

      {usersSummary && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Registered users"
            value={usersSummary.totalRegisteredUsers}
            detail="Total accounts in the database"
          />
          <MetricCard
            label="Matching filters"
            value={usersSummary.filteredUsers}
            detail="Users shown by the current list filters"
          />
          <MetricCard
            label="Active in window"
            value={usersSummary.usersWithActivityInWindow}
            detail="At least one tracked page view"
          />
          <MetricCard
            label="No activity in window"
            value={usersSummary.usersWithoutActivityInWindow}
            detail="No tracked page views in the selected range"
          />
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <div>
              <div className="text-sm font-medium text-gray-700">
                User activity window
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {RANGE_OPTIONS.map((option) => (
                  <button
                    key={option.days}
                    type="button"
                    onClick={() => {
                      setActivityDays(option.days);
                      setUsersPage(1);
                    }}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                      activityDays === option.days
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
              <div className="text-sm font-medium text-gray-700">
                Activity filter
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {ACTIVITY_FILTER_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setActivityFilter(option.value);
                      setUsersPage(1);
                    }}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                      activityFilter === option.value
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

          <form
            onSubmit={handleSearchSubmit}
            className="flex w-full flex-col gap-3 xl:max-w-xl"
          >
            <label
              htmlFor="userSearch"
              className="text-sm font-medium text-gray-700"
            >
              Search by email, name, or exact user ID
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="userSearch"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Example: user@example.com"
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
                onClick={clearUserFilters}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Reset
              </button>
            </div>
            {isUsersFetching && (
              <div className="text-xs text-slate-500">Refreshing users…</div>
            )}
          </form>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_1.2fr]">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Registered Users
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Click a user to inspect their tracked URL history and settings.
            </p>
          </div>

          {users.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        User
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Registered
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Unique URLs
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Last opened
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {users.map((user) => {
                      const selected = user.id === selectedUserId;
                      return (
                        <tr
                          key={user.id}
                          className={`cursor-pointer align-top transition hover:bg-slate-50 ${
                            selected ? "bg-indigo-50/70" : ""
                          }`}
                          onClick={() => selectUser(user)}
                        >
                          <td className="px-5 py-4 text-sm text-slate-900">
                            <div className="font-medium">
                              {user.name || "Unnamed user"}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {user.email || "No email"}
                            </div>
                            <div className="mt-2 font-mono text-[11px] text-slate-400">
                              {user.id}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-700">
                            <div>{formatDateTime(user.createdAt)}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              Last login {formatDateTime(user.lastLogin)}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-700">
                            <div className="font-semibold text-slate-900">
                              {user.uniqueUrlsInWindow}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {user.totalPageViewsInWindow} page views in window
                            </div>
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-700">
                            {formatDateTime(user.lastOpenedUtc)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate-600">
                  Page {usersData?.page ?? 1} of {Math.max(usersData?.totalPages ?? 0, 1)} with{" "}
                  {usersData?.totalCount ?? 0} matching users
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setUsersPage((current) => Math.max(1, current - 1))}
                    disabled={(usersData?.page ?? 1) <= 1}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setUsersPage((current) =>
                        usersData?.totalPages
                          ? Math.min(usersData.totalPages, current + 1)
                          : 1
                      )
                    }
                    disabled={
                      !usersData?.totalPages ||
                      (usersData.page ?? 1) >= usersData.totalPages
                    }
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="px-5 py-10 text-center text-sm text-slate-500">
              No registered users matched the current filters.
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-gray-900">
              User Detail
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Activity history is grouped by exact URL so repeated opens are easy
              to review.
            </p>
          </div>

          {!selectedUserId ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">
              Select a user from the list to see activity and settings.
            </div>
          ) : isActivityLoading ? (
            <div className="px-5 py-10">
              <LoadingSpinner />
            </div>
          ) : activityError ? (
            <div className="px-5 py-6">
              <ErrorMessage
                message="Failed to load user activity"
                onRetry={() => refetchActivity()}
              />
            </div>
          ) : (
            <div className="space-y-6 px-5 py-5">
              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-900">
                      {selectedUser?.name || selectedUserFromList?.name || "Unnamed user"}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {selectedUser?.email || selectedUserFromList?.email || "No email"}
                    </p>
                    <p className="mt-2 font-mono text-xs text-slate-500">
                      {selectedUserId}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                    <div>Registered {formatDateTime(selectedUser?.createdAt)}</div>
                    <div className="mt-1">
                      Last login {formatDateTime(selectedUser?.lastLogin)}
                    </div>
                    <div className="mt-1">
                      Last opened {formatDateTime(selectedUserFromList?.lastOpenedUtc)}
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid gap-4 md:grid-cols-3">
                <MetricCard
                  label="URLs in window"
                  value={activityData?.summary.uniqueUrls ?? 0}
                  detail="Distinct exact URLs opened"
                />
                <MetricCard
                  label="Opens in window"
                  value={activityData?.summary.totalViews ?? 0}
                  detail="Tracked page views for the selected period"
                />
                <MetricCard
                  label="Last open in window"
                  value={formatDateTime(activityData?.summary.lastOpenedUtc)}
                  detail="Most recent tracked page view in the selected period"
                  compact
                />
              </section>

              <section className="rounded-2xl border border-slate-200 p-4">
                <h3 className="text-base font-semibold text-slate-900">
                  Study Guide Limit
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Value is stored in bytes. Leave blank to use the default 51,200
                  byte limit.
                </p>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div>
                    <label
                      htmlFor="studyGuideBytes"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      {STUDY_GUIDE_KEY}
                    </label>
                    <input
                      id="studyGuideBytes"
                      type="number"
                      min={0}
                      max={1_000_000}
                      value={studyGuideBytes}
                      onChange={(event) => {
                        if (updateMutation.isSuccess || updateMutation.isError) {
                          updateMutation.reset();
                        }
                        setStudyGuideBytes(event.target.value);
                      }}
                      className="w-44 rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="text-sm text-slate-600">
                    <div>
                      Effective max:{" "}
                      <span className="font-mono text-slate-900">
                        {effectiveMaxBytes.toLocaleString()} bytes
                      </span>{" "}
                      ({(effectiveMaxBytes / 1024).toFixed(1)} KB)
                    </div>
                    {settingsData?.settings[STUDY_GUIDE_KEY] === undefined && (
                      <div className="mt-1 text-xs text-slate-500">
                        No override saved for this user yet.
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => updateMutation.mutate(String(effectiveMaxBytes))}
                    disabled={updateMutation.isPending}
                    className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {updateMutation.isPending ? "Saving..." : "Save"}
                  </button>
                </div>

                {isSettingsLoading && (
                  <div className="mt-3 text-xs text-slate-500">
                    Loading saved settings…
                  </div>
                )}
                {settingsError && (
                  <div className="mt-3">
                    <ErrorMessage
                      message="Failed to load user settings"
                      onRetry={() => refetchSettings()}
                    />
                  </div>
                )}
                {updateMutation.isError && (
                  <div className="mt-3">
                    <ErrorMessage message="Failed to save study guide limit" />
                  </div>
                )}
                {updateMutation.isSuccess && (
                  <div className="mt-3 text-sm text-emerald-700">
                    Study guide limit saved.
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200">
                <div className="border-b border-slate-200 px-4 py-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">
                        URL History
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">
                        Grouped by exact URL, with first and last open times.
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {RANGE_OPTIONS.map((option) => (
                          <button
                            key={`history-${option.days}`}
                            type="button"
                            onClick={() => {
                              setHistoryDays(option.days);
                              setHistoryPage(1);
                            }}
                            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                              historyDays === option.days
                                ? "bg-indigo-600 text-white"
                                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>

                      <form
                        onSubmit={handleHistorySearchSubmit}
                        className="flex flex-col gap-2 sm:flex-row"
                      >
                        <input
                          value={urlFilterInput}
                          onChange={(event) => setUrlFilterInput(event.target.value)}
                          placeholder="Filter exact URLs or paths"
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                        />
                        <button
                          type="submit"
                          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                        >
                          Apply
                        </button>
                      </form>
                    </div>
                  </div>
                  {isActivityFetching && (
                    <div className="mt-3 text-xs text-slate-500">
                      Refreshing activity…
                    </div>
                  )}
                </div>

                {activityData && activityData.urlHistory.length > 0 ? (
                  <>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                              URL
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Opens
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                              First opened
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Last opened
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white">
                          {activityData.urlHistory.map((entry) => (
                            <tr key={`${entry.url}-${entry.lastOpenedUtc}`} className="align-top">
                              <td className="px-4 py-4 text-sm text-slate-900">
                                <div className="max-w-xl break-all font-medium">
                                  {entry.url}
                                </div>
                                <div className="mt-1 text-xs text-slate-500">
                                  Path: {entry.path}
                                </div>
                              </td>
                              <td className="px-4 py-4 text-sm text-slate-700">
                                {entry.openCount}
                              </td>
                              <td className="px-4 py-4 text-sm text-slate-700">
                                {formatDateTime(entry.firstOpenedUtc)}
                              </td>
                              <td className="px-4 py-4 text-sm text-slate-700">
                                {formatDateTime(entry.lastOpenedUtc)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm text-slate-600">
                        Page {activityData.page} of {Math.max(activityData.totalPages, 1)} with{" "}
                        {activityData.totalCount} URLs
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setHistoryPage((current) => Math.max(1, current - 1))
                          }
                          disabled={activityData.page <= 1}
                          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setHistoryPage((current) =>
                              activityData.totalPages > 0
                                ? Math.min(activityData.totalPages, current + 1)
                                : 1
                            )
                          }
                          disabled={
                            activityData.totalPages === 0 ||
                            activityData.page >= activityData.totalPages
                          }
                          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="px-4 py-10 text-center text-sm text-slate-500">
                    No tracked URL history matched the selected filters.
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
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

export default AdminUserSettingsPage;
