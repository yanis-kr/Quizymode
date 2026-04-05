import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  adminApi,
  type SeedSyncApplyResponse,
  type SeedSyncPreviewResponse,
  type SeedSyncRequest,
} from "@/api/admin";

function extractErrorMessage(error: unknown): string {
  const fallback = "The request failed. Check the repository settings and try again.";

  if (!error || typeof error !== "object") {
    return fallback;
  }

  const candidate = error as {
    response?: { data?: unknown };
    message?: string;
  };

  const data = candidate.response?.data;
  if (Array.isArray(data) && data.length > 0) {
    const messages = data
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }

        const item = entry as { errorMessage?: string };
        return item.errorMessage ?? null;
      })
      .filter(Boolean);

    if (messages.length > 0) {
      return messages.join(" ");
    }
  }

  return (
    (typeof data === "object" &&
    data !== null &&
    !Array.isArray(data) &&
    ("detail" in data || "description" in data || "title" in data)
      ? (((data as { detail?: string }).detail ||
          (data as { description?: string }).description ||
          (data as { title?: string }).title) ??
        null)
      : null) ||
    candidate.message ||
    fallback
  );
}

function SummaryCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "border-green-200 bg-green-50 text-green-900"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-gray-200 bg-white text-gray-900";

  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <div className="text-xs font-medium uppercase tracking-wide opacity-70">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value.toLocaleString()}</div>
    </div>
  );
}

function ResultsPanel({
  title,
  response,
}: {
  title: string;
  response: SeedSyncPreviewResponse | SeedSyncApplyResponse;
}) {
  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-medium text-gray-900">{title}</h2>
          <p className="text-sm text-gray-600">
            {response.repositoryOwner}/{response.repositoryName}
          </p>
          <p className="text-sm text-gray-500">
            Ref <span className="font-mono">{response.gitRef}</span>
            {" · "}
            Commit{" "}
            <span className="font-mono">
              {response.resolvedCommitSha.slice(0, 12)}
            </span>
          </p>
          <p className="text-sm text-gray-500">
            Path <span className="font-mono">{response.itemsPath}</span>
            {" · "}
            Files {response.sourceFileCount.toLocaleString()}
          </p>
        </div>
        <div className="text-sm text-gray-500">
          Payload items: {response.totalItemsInPayload.toLocaleString()}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <SummaryCard label="Created" value={response.createdCount} tone="success" />
        <SummaryCard label="Updated" value={response.updatedCount} tone="success" />
        <SummaryCard label="Unchanged" value={response.unchangedCount} />
        <SummaryCard label="Existing" value={response.existingItemCount} />
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-md font-medium text-gray-900">Delta</h3>
          {response.hasMoreChanges && (
            <span className="text-xs text-gray-500">
              Only the first returned changes are shown.
            </span>
          )}
        </div>

        {response.changes.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">
            No delta rows were returned for this response.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                    Action
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                    Scope
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                    Question
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                    Changed fields
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {response.changes.map((change) => (
                  <tr key={change.itemId}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {change.action}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <div>{change.category}</div>
                      <div className="text-xs text-gray-500">
                        {change.navigationKeyword1} / {change.navigationKeyword2}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div className="max-w-xl">{change.question}</div>
                      <div className="mt-1 font-mono text-xs text-gray-400">
                        {change.itemId}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {change.changedFields.length > 0
                        ? change.changedFields.join(", ")
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const defaultItemsPath = "data/seed-source/items";

const AdminSeedSyncPage = () => {
  const { isAuthenticated, isAdmin } = useAuth();
  const [repositoryOwner, setRepositoryOwner] = useState("Quizymode");
  const [repositoryName, setRepositoryName] = useState("Quizymode");
  const [gitRef, setGitRef] = useState("main");
  const [itemsPath, setItemsPath] = useState(defaultItemsPath);
  const [deltaPreviewLimit, setDeltaPreviewLimit] = useState("200");
  const [localError, setLocalError] = useState<string | null>(null);
  const [previewResponse, setPreviewResponse] =
    useState<SeedSyncPreviewResponse | null>(null);
  const [applyResponse, setApplyResponse] =
    useState<SeedSyncApplyResponse | null>(null);

  const resetResults = () => {
    setLocalError(null);
    setPreviewResponse(null);
    setApplyResponse(null);
  };

  const previewMutation = useMutation({
    mutationFn: (request: SeedSyncRequest) => adminApi.previewSeedSync(request),
    onSuccess: (response) => {
      setLocalError(null);
      setApplyResponse(null);
      setPreviewResponse(response);
    },
    onError: (error) => {
      setPreviewResponse(null);
      setApplyResponse(null);
      setLocalError(extractErrorMessage(error));
    },
  });

  const applyMutation = useMutation({
    mutationFn: (request: SeedSyncRequest) => adminApi.applySeedSync(request),
    onSuccess: (response) => {
      setLocalError(null);
      setPreviewResponse(null);
      setApplyResponse(response);
    },
    onError: (error) => {
      setApplyResponse(null);
      setLocalError(extractErrorMessage(error));
    },
  });

  if (!isAuthenticated || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  const buildRequest = (): SeedSyncRequest => {
    resetResults();

    const owner = repositoryOwner.trim();
    const repo = repositoryName.trim();
    const ref = gitRef.trim();
    const path = itemsPath.trim();
    const limit = Number(deltaPreviewLimit.trim());

    if (!owner || !repo || !ref) {
      throw new Error("Repository owner, repository name, and git ref are required.");
    }

    if (!Number.isInteger(limit) || limit < 0 || limit > 500) {
      throw new Error("Delta preview limit must be an integer between 0 and 500.");
    }

    return {
      schemaVersion: 2,
      repositoryOwner: owner,
      repositoryName: repo,
      gitRef: ref,
      itemsPath: path || defaultItemsPath,
      deltaPreviewLimit: limit,
    };
  };

  const handlePreview = () => {
    try {
      previewMutation.mutate(buildRequest());
    } catch (error) {
      setLocalError(extractErrorMessage(error));
    }
  };

  const handleApply = () => {
    try {
      applyMutation.mutate(buildRequest());
    } catch (error) {
      setLocalError(extractErrorMessage(error));
    }
  };

  const isWorking = previewMutation.isPending || applyMutation.isPending;

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6 flex items-center gap-4">
        <Link
          to="/admin"
          className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
        >
          {"<-"} Admin Dashboard
        </Link>
      </div>

      <h1 className="text-3xl font-bold text-gray-900 mb-2">Seed Sync</h1>
      <p className="text-gray-600 text-sm mb-6">
        Preview or apply repo-managed items directly from GitHub. The API fetches
        canonical seed-source files at the exact ref you provide and never infers
        deletes from missing rows.
      </p>

      <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        Use an immutable commit SHA for production whenever possible. Branch refs
        are convenient for testing, but commit-based syncs are easier to audit and
        roll back.
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">
                Repository owner
              </span>
              <input
                value={repositoryOwner}
                onChange={(event) => {
                  setRepositoryOwner(event.target.value);
                  resetResults();
                }}
                className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Quizymode"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">
                Repository name
              </span>
              <input
                value={repositoryName}
                onChange={(event) => {
                  setRepositoryName(event.target.value);
                  resetResults();
                }}
                className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Quizymode"
              />
            </label>

            <label className="block md:col-span-2">
              <span className="text-sm font-medium text-gray-700">Git ref</span>
              <input
                value={gitRef}
                onChange={(event) => {
                  setGitRef(event.target.value);
                  resetResults();
                }}
                className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm"
                placeholder="main or a commit SHA"
              />
            </label>

            <label className="block md:col-span-2">
              <span className="text-sm font-medium text-gray-700">
                Items path
              </span>
              <input
                value={itemsPath}
                onChange={(event) => {
                  setItemsPath(event.target.value);
                  resetResults();
                }}
                className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm"
                placeholder={defaultItemsPath}
              />
              <p className="mt-2 text-xs text-gray-500">
                Use a narrower subpath to preview just one category or scope.
              </p>
            </label>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 p-4">
              <label className="block text-sm font-medium text-gray-700">
                Delta preview limit
              </label>
              <input
                type="number"
                min={0}
                max={500}
                value={deltaPreviewLimit}
                onChange={(event) => {
                  setDeltaPreviewLimit(event.target.value);
                  resetResults();
                }}
                className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <p className="mt-2 text-xs text-gray-500">
                Server-enforced range is 0 to 500.
              </p>
            </div>

            <div className="rounded-lg border border-gray-200 p-4 text-sm text-gray-600">
              <p>
                The sync reads canonical JSON directly from GitHub. Local seed-dev
                startup seeding still uses checked-out local files.
              </p>
            </div>

            <button
              type="button"
              onClick={handlePreview}
              disabled={isWorking}
              className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {previewMutation.isPending ? "Previewing..." : "Preview sync"}
            </button>

            <button
              type="button"
              onClick={handleApply}
              disabled={isWorking}
              className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {applyMutation.isPending ? "Applying..." : "Apply sync"}
            </button>
          </div>
        </div>

        {localError && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {localError}
          </div>
        )}
      </div>

      <div className="mt-6 space-y-6">
        {previewResponse && (
          <ResultsPanel title="Preview results" response={previewResponse} />
        )}
        {applyResponse && (
          <ResultsPanel title="Apply results" response={applyResponse} />
        )}
      </div>
    </div>
  );
};

export default AdminSeedSyncPage;
