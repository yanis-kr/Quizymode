import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "@/api/users";
import { useAuth } from "@/contexts/AuthContext";

const SESSION_KEY = "qm_show_answers";
const SETTING_KEY = "HideAnswers";

/**
 * Manages the "show answers" toggle in list mode.
 *
 * - Authenticated users: default driven by "HideAnswers" user setting (default "true" = hidden).
 *   Toggling updates the persistent setting so the preference is remembered across sessions.
 * - Anonymous users: default always hidden; toggle stored in sessionStorage for the current session.
 *
 * Toggle value persists when navigating between list pages (categories, collection detail).
 * It can be lost when switching to explore/quiz views (acceptable per spec).
 */
export const useShowAnswers = () => {
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
    if (!isAuthenticated) {
      return sessionStorage.getItem(SESSION_KEY) === "true";
    }
    if (settingsData) {
      // HideAnswers="false" means user wants to see answers
      return settingsData.settings[SETTING_KEY] === "false";
    }
    return false; // default: hidden while loading
  };

  const [showAnswers, setShowAnswers] = useState<boolean>(getInitialShowAnswers);

  // Sync once settings load for auth users who didn't have cached data on mount
  const [syncedFromSetting, setSyncedFromSetting] = useState(
    () => !isAuthenticated || settingsData !== undefined
  );

  useEffect(() => {
    if (!syncedFromSetting && settingsData !== undefined) {
      setShowAnswers(settingsData.settings[SETTING_KEY] === "false");
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
