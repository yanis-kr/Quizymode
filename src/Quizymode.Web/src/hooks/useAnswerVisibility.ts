import { useCallback, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi, type UserSettingsResponse } from "@/api/users";
import { useAuth } from "@/contexts/AuthContext";

export const ANSWER_VISIBILITY_STORAGE_KEY = "quizymode.list.show-answers.v1";
const SETTING_KEY = "HideAnswers";
const SETTINGS_QUERY_KEY = ["userSettings"] as const;

function readStored(): boolean | null {
  try {
    const raw = window.localStorage.getItem(ANSWER_VISIBILITY_STORAGE_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
  } catch {
    // Storage can be blocked; the default (hidden) applies.
  }
  return null;
}

function writeStored(value: boolean): void {
  try {
    window.localStorage.setItem(ANSWER_VISIBILITY_STORAGE_KEY, String(value));
  } catch {
    // Ignore: the choice then only lasts for this page view.
  }
}

const EMPTY_IDS: ReadonlySet<string> = new Set<string>();

/**
 * Answer visibility for list pages (#647, AC 4.7.11 to 4.7.15). Answers are hidden by default for everyone.
 * Precedence: the ?showAnswers= URL override, then the signed-in "HideAnswers" server setting, then the browser's
 * saved choice (localStorage), then hidden. A signed-in visitor sees answers hidden until the settings load or fail,
 * so a saved "show" never flashes before the server says hide.
 *
 * - urlOverride: initial state only; once the visitor uses the toggle their choice wins.
 * - pageKey: per-item reveals are cleared whenever it changes (page change).
 */
export function useAnswerVisibility(urlOverride?: boolean, pageKey: string | number = 0) {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: () => usersApi.getSettings(),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const [stored, setStored] = useState<boolean | null>(readStored);
  const [choice, setChoice] = useState<boolean | null>(null);
  const [revealed, setRevealed] = useState<{ key: string | number; ids: ReadonlySet<string> }>({
    key: pageKey,
    ids: EMPTY_IDS,
  });

  const settingsSettled = settingsQuery.isSuccess || settingsQuery.isError;
  const isReady = urlOverride !== undefined || (!isAuthLoading && (!isAuthenticated || settingsSettled));

  const serverHide = isAuthenticated ? settingsQuery.data?.settings?.[SETTING_KEY] : undefined;
  const serverShow: boolean | null = serverHide === "true" ? false : serverHide === "false" ? true : null;

  let showAll: boolean;
  if (choice !== null) showAll = choice;
  else if (urlOverride !== undefined) showAll = urlOverride;
  else if (!isReady) showAll = false;
  else if (serverShow !== null) showAll = serverShow;
  else showAll = stored ?? false;

  const updateSetting = useMutation({
    mutationFn: (hide: boolean) => usersApi.updateSetting({ key: SETTING_KEY, value: hide ? "true" : "false" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
    },
  });

  const toggleAll = useCallback(() => {
    const next = !showAll;
    setChoice(next);
    setStored(next);
    writeStored(next);
    if (isAuthenticated) {
      // Keep the cached setting in step so a remount before the refetch does not read the old server value.
      queryClient.setQueryData<UserSettingsResponse>(SETTINGS_QUERY_KEY, (prev) => ({
        settings: { ...(prev?.settings ?? {}), [SETTING_KEY]: next ? "false" : "true" },
      }));
      updateSetting.mutate(!next);
    }
  }, [showAll, isAuthenticated, queryClient, updateSetting]);

  const revealedIds: ReadonlySet<string> = revealed.key === pageKey ? revealed.ids : EMPTY_IDS;

  const toggleItem = useCallback(
    (id: string) => {
      setRevealed((prev) => {
        const base = prev.key === pageKey ? prev.ids : EMPTY_IDS;
        const next = new Set(base);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { key: pageKey, ids: next };
      });
    },
    [pageKey]
  );

  const isAnswerVisible = useCallback((id: string) => showAll || revealedIds.has(id), [showAll, revealedIds]);

  return { showAll, toggleAll, isReady, revealedIds, toggleItem, isAnswerVisible };
}
