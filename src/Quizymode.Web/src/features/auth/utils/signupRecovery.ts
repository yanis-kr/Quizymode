/**
 * Bounded, tab-scoped recovery for the signup confirmation step. Lets a
 * reload during "check your email" resume without losing the pending
 * email/cooldown state. Deliberately minimal: never stores a password or
 * verification code, expires after 24 hours, and degrades to the normal
 * (non-recovered) flow on any storage/parse failure rather than breaking it.
 */

const STORAGE_KEY = "quizymode.signup-recovery.v1";
const SCHEMA_VERSION = 1;
const EXPIRY_MS = 24 * 60 * 60 * 1000;

export interface SignupRecoveryState {
  email: string;
  cooldownUntil: number | null;
}

interface StoredRecord {
  version: number;
  email: string;
  cooldownUntil: number | null;
  expiresAt: number;
}

export function saveSignupRecovery(state: SignupRecoveryState): void {
  try {
    const record: StoredRecord = {
      version: SCHEMA_VERSION,
      email: state.email,
      cooldownUntil: state.cooldownUntil,
      expiresAt: Date.now() + EXPIRY_MS,
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Recovery is a convenience, not a requirement; signup stays usable.
  }
}

export function readSignupRecovery(): SignupRecoveryState | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredRecord>;
    if (
      parsed.version !== SCHEMA_VERSION ||
      typeof parsed.email !== "string" ||
      parsed.email.length === 0 ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt < Date.now()
    ) {
      clearSignupRecovery();
      return null;
    }
    const cooldownUntil = typeof parsed.cooldownUntil === "number" ? parsed.cooldownUntil : null;
    return { email: parsed.email, cooldownUntil };
  } catch {
    return null;
  }
}

export function clearSignupRecovery(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}
