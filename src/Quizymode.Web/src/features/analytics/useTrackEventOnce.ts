import { useEffect } from "react";
import { trackEventOnce, type AnalyticsEventInput } from "./analyticsEvents";

/**
 * Records an impression-style event once per tab session for `onceKey` when the component
 * mounts (or the key changes). Pass a null key to skip, for example while data is loading.
 */
export function useTrackEventOnce(
  onceKey: string | null | undefined,
  input: AnalyticsEventInput
): void {
  const serializedInput = JSON.stringify(input);

  useEffect(() => {
    if (!onceKey) {
      return;
    }

    trackEventOnce(onceKey, JSON.parse(serializedInput) as AnalyticsEventInput);
  }, [onceKey, serializedInput]);
}
