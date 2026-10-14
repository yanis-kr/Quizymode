import type { SessionOutcome } from "@/api/admin";

/** Compact duration for table cells: 0s, 45s, 3m 20s, 1h 12m. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0s";
  }

  const rounded = Math.round(seconds);

  if (rounded < 60) {
    return `${rounded}s`;
  }

  if (rounded < 3600) {
    const minutes = Math.floor(rounded / 60);
    const remainder = rounded % 60;
    return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
  }

  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

export const OUTCOME_LABELS: Record<SessionOutcome, string> = {
  anonymous: "Anonymous",
  converted: "Converted",
  authenticated: "Authenticated",
};

export const OUTCOME_BADGE_CLASSES: Record<SessionOutcome, string> = {
  anonymous: "bg-amber-100 text-amber-800",
  converted: "bg-violet-100 text-violet-800",
  authenticated: "bg-emerald-100 text-emerald-800",
};

export const OUTCOME_BAR_CLASSES: Record<SessionOutcome, string> = {
  anonymous: "bg-amber-500",
  converted: "bg-violet-500",
  authenticated: "bg-emerald-500",
};

/**
 * Page views recorded before user-agent capture existed have no user agent.
 * Labelling those "Human" would overstate what is actually known about them.
 */
export function describeClient(
  userAgent: string | null,
  isBot: boolean
): string {
  if (isBot) {
    return "Bot";
  }

  return userAgent ? "Human" : "Unknown UA";
}

/** Trims a raw user-agent down to something readable in a table cell. */
export function shortenUserAgent(userAgent: string | null): string | null {
  if (!userAgent) {
    return null;
  }

  return userAgent.length > 60 ? `${userAgent.slice(0, 60)}…` : userAgent;
}
