import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";

interface AdminUserSettingsResponse {
  settings: Record<string, string>;
}

interface AdminUserResponse {
  id: string;
  name?: string | null;
  email?: string | null;
  createdAt: string;
  lastLogin: string;
}

const STUDY_GUIDE_KEY = "StudyGuideMaxBytes";
const DEFAULT_MAX_BYTES = 51200;

const AdminUserSettingsPage = () => {
  const { isAuthenticated, isAdmin } = useAuth();
  const [userIdInput, setUserIdInput] = useState("");
  const [loadedUser, setLoadedUser] = useState<AdminUserResponse | null>(null);
  const [currentSettings, setCurrentSettings] =
    useState<AdminUserSettingsResponse | null>(null);
  const [studyGuideBytes, setStudyGuideBytes] = useState<string>("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const updateMutation = useMutation({
    mutationFn: async (value: string) => {
      if (!loadedUser) throw new Error("No user loaded");
      await apiClient.put(`/admin/users/${loadedUser.id}/settings`, {
        key: STUDY_GUIDE_KEY,
        value,
      });
    },
  });

  if (!isAuthenticated || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  const handleLoadUser = async () => {
    const id = userIdInput.trim();
    if (!id) return;
    setIsLoading(true);
    setLoadError(null);
    setLoadedUser(null);
    setCurrentSettings(null);
    try {
      const userResp = await apiClient.get<AdminUserResponse>(
        `/admin/users/${id}`
      );
      const settingsResp = await apiClient.get<AdminUserSettingsResponse>(
        `/admin/users/${id}/settings`
      );
      setLoadedUser(userResp.data);
      setCurrentSettings(settingsResp.data);
      const raw = settingsResp.data.settings[STUDY_GUIDE_KEY];
      setStudyGuideBytes(raw ?? "");
    } catch (err: any) {
      console.error("Failed to load user or settings", err);
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.description ||
        err?.message ||
        "Failed to load user or settings.";
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const effectiveMaxBytes = (() => {
    const raw = studyGuideBytes.trim();
    if (raw === "") return DEFAULT_MAX_BYTES;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return 0;
    if (n > 1_000_000) return 1_000_000;
    return Math.trunc(n);
  })();

  return (
    <div className="px-4 py-6 sm:px-0">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">
        User Settings (Admin)
      </h1>
      <p className="text-gray-600 text-sm mb-6">
        Look up a user by ID and adjust their study guide size limit. Default
        limit is 50 KB (51,200 bytes) when no override is set.
      </p>

      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          Find user by ID
        </h2>
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              User ID (GUID)
            </label>
            <input
              type="text"
              value={userIdInput}
              onChange={(e) => setUserIdInput(e.target.value)}
              placeholder="e.g. 123e4567-e89b-12d3-a456-426614174000"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <button
            type="button"
            onClick={handleLoadUser}
            disabled={!userIdInput.trim() || isLoading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {isLoading ? "Loading..." : "Load user"}
          </button>
        </div>
        {loadError && (
          <div className="mt-3">
            <ErrorMessage message={loadError} />
          </div>
        )}
      </div>

      {isLoading && !loadedUser && <LoadingSpinner />}

      {loadedUser && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-2">
            User details
          </h2>
          <p className="text-sm text-gray-700">
            <span className="font-medium">ID:</span>{" "}
            <span className="font-mono">{loadedUser.id}</span>
          </p>
          <p className="text-sm text-gray-700 mt-1">
            <span className="font-medium">Name:</span>{" "}
            {loadedUser.name || <span className="text-gray-400">N/A</span>}
          </p>
          <p className="text-sm text-gray-700 mt-1">
            <span className="font-medium">Email:</span>{" "}
            {loadedUser.email || <span className="text-gray-400">N/A</span>}
          </p>

          <div className="mt-6 border-t border-gray-200 pt-4">
            <h3 className="text-md font-medium text-gray-900 mb-2">
              Study guide limit
            </h3>
            <p className="text-sm text-gray-600 mb-3">
              Configure the maximum allowed study guide size for this user.
              Value is in bytes. Allowed range: 0–1,000,000. 0 means the user
              cannot save any non-empty study guide. If empty, the default of
              51,200 bytes (50 KB) applies.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {STUDY_GUIDE_KEY} (bytes)
                </label>
                <input
                  type="number"
                  min={0}
                  max={1_000_000}
                  value={studyGuideBytes}
                  onChange={(e) => setStudyGuideBytes(e.target.value)}
                  className="w-40 px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>
              <div className="text-sm text-gray-600">
                <p>
                  <span className="font-medium">Effective max:</span>{" "}
                  <span className="font-mono">
                    {effectiveMaxBytes.toLocaleString()} bytes
                  </span>{" "}
                  ({(effectiveMaxBytes / 1024).toFixed(1)} KB)
                </p>
                {currentSettings &&
                  currentSettings.settings[STUDY_GUIDE_KEY] === undefined && (
                    <p className="text-xs text-gray-500 mt-1">
                      No override set yet; using default 51,200 bytes.
                    </p>
                  )}
              </div>
              <button
                type="button"
                onClick={() => updateMutation.mutate(String(effectiveMaxBytes))}
                disabled={updateMutation.isPending}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {updateMutation.isPending ? "Saving..." : "Save"}
              </button>
            </div>
            {updateMutation.isError && (
              <p className="mt-2 text-sm text-red-600">
                Failed to save setting. Please try again.
              </p>
            )}
            {updateMutation.isSuccess && (
              <p className="mt-2 text-sm text-green-600">
                Setting saved successfully.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUserSettingsPage;

