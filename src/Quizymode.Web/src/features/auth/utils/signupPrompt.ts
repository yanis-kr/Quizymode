import { trackEventOnce } from "@/features/analytics/analyticsEvents";
import { SIGNUP_PATH, buildAuthIntentQuery, type AuthReason } from "./authIntent";

/**
 * Contextual signup prompts (CONV-001, AC 4.2.10). Copy is a fixed, truthful lookup per allowlisted
 * reason: before PROGRESS-001 (#114) and CLAIM-003 (#115) ship, nothing here may claim that a guest
 * score is saved to, synced with, or imported into an account.
 */
export interface SignupPromptCopy {
  heading: string;
  body: string;
  cta: string;
}

export const SIGNUP_PROMPT_COPY: Record<AuthReason, SignupPromptCopy> = {
  "save-progress": {
    heading: "Make your next quiz yours",
    body: "Quiz scores are not saved to accounts yet. A free account lets you bookmark public collections and build private practice sets.",
    cta: "Create a free account",
  },
  "keep-collection": {
    heading: "Keep this collection",
    body: "Create a free account to bookmark this collection and find it again later.",
    cta: "Create account to bookmark",
  },
  "create-content": {
    heading: "Create your own study sets",
    body: "Create a free account to add private items and collections.",
    cta: "Create a free account",
  },
  "join-discussion": {
    heading: "Join the discussion",
    body: "Create a free account to comment where discussion is available.",
    cta: "Create account to comment",
  },
};

const DISMISSED_STORAGE_KEY = "quizymode.signup-prompt.dismissed";
const dismissedInMemory = new Set<AuthReason>();

/** The signup link for a prompt: the allowlisted reason plus a validated same-origin return path. */
export function buildSignupPromptHref(reason: AuthReason, returnTo: string): string {
  return `${SIGNUP_PATH}${buildAuthIntentQuery({ reason, returnTo })}`;
}

/**
 * Dismissal rule: dismissing a prompt hides prompts for that reason for the rest of the tab session
 * (sessionStorage), so it is not shown again on the next run, Play again, or a reload. A new tab or
 * browser session may show it again. Storage failures fall back to this page load only.
 */
export function isSignupPromptDismissed(reason: AuthReason): boolean {
  if (dismissedInMemory.has(reason)) return true;
  try {
    const raw = window.sessionStorage.getItem(DISMISSED_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as unknown[]).includes(reason) : false;
  } catch {
    return false;
  }
}

export function dismissSignupPrompt(reason: AuthReason): void {
  dismissedInMemory.add(reason);
  try {
    const raw = window.sessionStorage.getItem(DISMISSED_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    const reasons = Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : [];
    if (!reasons.includes(reason)) reasons.push(reason);
    window.sessionStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(reasons));
  } catch {
    // In-memory dismissal still covers this page load.
  }
}

/**
 * Prompt funnel events (AC 5.4.10), each at most once per tab session per reason. The only context sent
 * is type `auth` plus the allowlisted reason: never a return path, score, email or other user data.
 */
export function trackSignupPromptViewed(reason: AuthReason): void {
  trackEventOnce(`prompt:${reason}`, { name: "signup_prompt_viewed", contextType: "auth", contextId: reason });
}

export function trackSignupPromptClicked(reason: AuthReason): void {
  trackEventOnce(`prompt:${reason}`, { name: "signup_prompt_clicked", contextType: "auth", contextId: reason });
}

/** Test-only: clears in-memory dismissal state between tests. */
export function resetSignupPromptForTests(): void {
  dismissedInMemory.clear();
}
