import { useState, type ChangeEvent } from "react";
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
  const fallback = "The request failed. Check the manifest and try again.";

  if (!error || typeof error !== "object") {
    return fallback;
  }

  const candidate = error as {
    response?: {
      data?: unknown;
    };
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

function autoSeedSetFromItems(items: unknown[]): string {
  const first = items[0] as Record<string, unknown> | undefined;
  const category = typeof first?.category === "string" ? first.category.trim() : "";
  const kw1 = typeof first?.navigationKeyword1 === "string" ? first.navigationKeyword1.trim() : "";
  if (category && kw1) return `${category}/${kw1}`;
  const date = new Date().toISOString().slice(0, 10);
  return `import-${date}`;
}

function parseSeedSyncRequest(
  rawJson: string,
  deltaPreviewLimitInput: string
): SeedSyncRequest {
  const trimmed = rawJson.trim();
  if (!trimmed) {
    throw new Error("Paste or upload a seed-sync manifest first.");
  }

  const raw = JSON.parse(trimmed);

  // Accept a canonical item array and wrap it automatically.
  let parsed: SeedSyncRequest;
  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      throw new Error("Array must contain at least one item.");
    }
    parsed = {
      schemaVersion: 1,
      seedSet: autoSeedSetFromItems(raw),
      items: raw as SeedSyncRequest["items"],
    };
  } else {
    parsed = raw as SeedSyncRequest;

    if (!parsed || typeof parsed !== "object") {
      throw new Error("Manifest root must be a JSON object or array.");
    }

    if (
      typeof parsed.schemaVersion !== "number" ||
      typeof parsed.seedSet !== "string" ||
      !Array.isArray(parsed.items)
    ) {
      throw new Error(
        "Manifest must include schemaVersion, seedSet, and items."
      );
    }
  }

  const hasInvalidItemIds = parsed.items.some(
    (item) => typeof item.itemId !== "string" || item.itemId.trim().length === 0
  );
  if (hasInvalidItemIds) {
    throw new Error(
      "Every manifest item must include a non-empty itemId. Normalize raw AI output through the import-inbox tooling before seed sync."
    );
  }

  const limitTrimmed = deltaPreviewLimitInput.trim();
  if (limitTrimmed.length === 0) {
    const { deltaPreviewLimit: _omit, ...withoutLimit } = parsed;
    return withoutLimit;
  }

  const limit = Number(limitTrimmed);
  if (!Number.isInteger(limit) || limit < 0 || limit > 500) {
    throw new Error("Delta preview limit must be an integer between 0 and 500.");
  }

  return {
    ...parsed,
    deltaPreviewLimit: limit,
  };
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
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-medium text-gray-900">{title}</h2>
          <p className="text-sm text-gray-600">
            Seed set <span className="font-mono">{response.seedSet}</span>
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

const AdminSeedSyncPage = () => {
  const { isAuthenticated, isAdmin } = useAuth();
  const [manifestText, setManifestText] = useState("");
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
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

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      setManifestText(text);
      setSelectedFileName(file.name);
      resetResults();
    } catch {
      setLocalError("Failed to read the selected file.");
    } finally {
      event.target.value = "";
    }
  };

  const buildRequest = (): SeedSyncRequest => {
    resetResults();
    return parseSeedSyncRequest(manifestText, deltaPreviewLimit);
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
        Upload or paste one item manifest, preview the upsert delta, then
        apply it. The API uses explicit item IDs and never infers deletes from
        missing rows.
      </p>

      <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        Admin manifests must contain explicit <span className="font-mono">itemId</span>
        values for repo-managed public items. Preview/apply only creates or
        updates the items present in the uploaded file.
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-medium text-gray-900">
                  Manifest JSON
                </h2>
                <p className="text-sm text-gray-500">
                  Paste the generated manifest, or a plain canonical item array
                  that already includes itemId values.
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Load JSON file
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
            </div>

            {selectedFileName && (
              <p className="mt-3 text-sm text-gray-500">
                Loaded file: <span className="font-mono">{selectedFileName}</span>
              </p>
            )}

            <textarea
              value={manifestText}
              onChange={(e) => {
                setManifestText(e.target.value);
                resetResults();
              }}
              placeholder='{"schemaVersion":1,"seedSet":"core-public-items","items":[...]}'
              className="mt-4 min-h-[24rem] w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm text-gray-900"
              spellCheck={false}
            />
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
                onChange={(e) => {
                  setDeltaPreviewLimit(e.target.value);
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
                Use preview first before apply. Rows not included in the current
                manifest are left untouched.
              </p>
            </div>

            <button
              type="button"
              onClick={handlePreview}
              disabled={isWorking || !manifestText.trim()}
              className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {previewMutation.isPending ? "Previewing..." : "Preview delta"}
            </button>

            <button
              type="button"
              onClick={handleApply}
              disabled={isWorking || !manifestText.trim()}
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
