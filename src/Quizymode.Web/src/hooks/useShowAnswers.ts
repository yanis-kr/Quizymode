import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "@/api/users";
import { useAuth } from "@/contexts/AuthContext";

const SESSION_KEY = "qm_show_answers";
const SETTING_KEY = "HideAnswers";

/**
 * Manages the "show answers" toggle in list mode.
 *
 * - urlOverride: when provided (parsed from ?showAnswers=true|false), takes precedence over the
 *   stored preference for the initial render and suppresses the settings-sync effect.
 *   After mount the toggle works normally and continues to save/restore preferences.
 * - Authenticated users: default driven by "HideAnswers" user setting; absent = show.
 *   Toggling updates the persistent setting so the preference is remembered across sessions.
 * - Anonymous users: default show; toggle stored in sessionStorage for the current session.
 *
 * Toggle value persists when navigating between list pages (categories, collection detail).
 * It can be lost when switching to explore/quiz views (acceptable per spec).
 */
export const useShowAnswers = (urlOverride?: boolean) => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const { data: settingsData } = useQuery({
    queryKey: ["userSettings"],
    queryFn: () => usersApi.getSettings(),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const getInitialShowAnswers = (): boolean => {
    if (urlOverride !== undefined) return urlOverride;
    if (!isAuthenticated) {
      // Default show; only hide if user explicitly toggled off in this session
      return sessionStorage.getItem(SESSION_KEY) !== "false";
    }
    if (settingsData) {
      // HideAnswers="true" means user explicitly wants to hide; anything else = show
      return settingsData.settings[SETTING_KEY] !== "true";
    }
    return true; // default: show while setting is loading
  };

  const [showAnswers, setShowAnswers] = useState<boolean>(getInitialShowAnswers);

  // Sync once settings load for auth users who didn't have cached data on mount.
  // Skipped when urlOverride is set — the URL param wins for the initial state.
  const [syncedFromSetting, setSyncedFromSetting] = useState(
    () => urlOverride !== undefined || !isAuthenticated || settingsData !== undefined
  );

  useEffect(() => {
    if (!syncedFromSetting && settingsData !== undefined) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowAnswers(settingsData.settings[SETTING_KEY] !== "true");
      setSyncedFromSetting(true);
    }
  }, [syncedFromSetting, settingsData]);

  const updateSettingMutation = useMutation({
    mutationFn: (hide: boolean) =>
      usersApi.updateSetting({ key: SETTING_KEY, value: hide ? "true" : "false" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userSettings"] });
    },
    onError: () => {
      // Revert optimistic update on failure
      if (settingsData) {
        setShowAnswers(settingsData.settings[SETTING_KEY] === "false");
      }
    },
  });

  const toggleShowAnswers = () => {
    const next = !showAnswers;
    setShowAnswers(next);
    if (isAuthenticated) {
      // Persist: HideAnswers is the inverse of showAnswers
      updateSettingMutation.mutate(!next);
    } else {
      sessionStorage.setItem(SESSION_KEY, next.toString());
    }
  };

  return { showAnswers, toggleShowAnswers };
};
