import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usersApi, type UserSettingsResponse } from "@/api/users";
import { useAuth } from "@/contexts/AuthContext";
import { useInterests, useLocalVersion } from "@/features/interests/useInterests";
import { readLocalInterests } from "@/features/learningLoop/localLearningState";

const SETTING_KEY_TOPIC_ONBOARDING = "TopicOnboarding";
const SESSION_DISMISSED_KEY = "quizymode.topicOnboarding.dismissed";

function readSessionDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSessionDismissed(): void {
  try {
    window.sessionStorage.setItem(SESSION_DISMISSED_KEY, "1");
  } catch {
    // Storage unavailable: the in-memory flag still hides the card for this page view.
  }
}

/** "loading": the visitor may get the card, but the TopicOnboarding setting is not known yet. */
export type TopicOnboardingCardState = "shown" | "loading" | "hidden";

/**
 * The one visibility rule for the "Make Home yours" card (#382), shared with the For you lane so only one topic prompt
 * shows at a time (#903). Only signed-in visitors with no topics and no browser-local picks waiting to be claimed into
 * the account are eligible. Call it once per page so a dismissal reaches the card and the lane together.
 */
export function useTopicOnboarding(): { cardState: TopicOnboardingCardState; dismiss: () => void } {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const queryClient = useQueryClient();
  const [dismissedHere, setDismissedHere] = useState(false);
  const signedIn = isAuthenticated && !isAuthLoading;

  const { interests, status } = useInterests();
  // Re-read on every local change: a pending claim clears the local copy, and until then the prompt must not flash.
  useLocalVersion();
  const eligible =
    signedIn &&
    status === "ready" &&
    interests.length === 0 &&
    readLocalInterests().length === 0 &&
    !dismissedHere &&
    !readSessionDismissed();

  const settings = useQuery({
    queryKey: ["userSettings"],
    queryFn: () => usersApi.getSettings(),
    enabled: signedIn && status === "ready" && interests.length === 0,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const cardState: TopicOnboardingCardState = !eligible
    ? "hidden"
    : settings.isPending
      ? "loading"
      : settings.isSuccess && !settings.data.settings[SETTING_KEY_TOPIC_ONBOARDING]
        ? "shown"
        : "hidden";

  const dismiss = () => {
    writeSessionDismissed();
    setDismissedHere(true);
    queryClient.setQueryData<UserSettingsResponse>(["userSettings"], (current) => ({
      settings: { ...current?.settings, [SETTING_KEY_TOPIC_ONBOARDING]: "dismissed" },
    }));
    // Best effort: a failed write only means the card may return in a later session.
    void usersApi.updateSetting({ key: SETTING_KEY_TOPIC_ONBOARDING, value: "dismissed" }).catch(() => {});
  };

  return { cardState, dismiss };
}
