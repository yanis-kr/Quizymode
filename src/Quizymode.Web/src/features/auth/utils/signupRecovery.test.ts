import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSignupRecovery,
  readSignupRecovery,
  saveSignupRecovery,
} from "./signupRecovery";

const STORAGE_KEY = "quizymode.signup-recovery.v1";

describe("signupRecovery", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips email and cooldown", () => {
    saveSignupRecovery({ email: "user@example.com", cooldownUntil: 12345 });
    expect(readSignupRecovery()).toEqual({ email: "user@example.com", cooldownUntil: 12345 });
  });

  it("returns null when nothing is stored", () => {
    expect(readSignupRecovery()).toBeNull();
  });

  it("never persists a password or verification code", () => {
    saveSignupRecovery({ email: "user@example.com", cooldownUntil: null });
    const raw = window.sessionStorage.getItem(STORAGE_KEY) ?? "";
    expect(raw).not.toContain("password");
    expect(raw).not.toContain("code");
  });

  it("clears on explicit clear", () => {
    saveSignupRecovery({ email: "user@example.com", cooldownUntil: null });
    clearSignupRecovery();
    expect(readSignupRecovery()).toBeNull();
  });

  it("discards an expired record (older than 24 hours)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    saveSignupRecovery({ email: "user@example.com", cooldownUntil: null });

    vi.setSystemTime(24 * 60 * 60 * 1000 + 1);
    expect(readSignupRecovery()).toBeNull();
  });

  it("discards a record from a future/unsupported schema version", () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 99, email: "user@example.com", cooldownUntil: null, expiresAt: Date.now() + 1000 })
    );
    expect(readSignupRecovery()).toBeNull();
  });

  it("discards corrupt JSON without throwing", () => {
    window.sessionStorage.setItem(STORAGE_KEY, "{not json");
    expect(() => readSignupRecovery()).not.toThrow();
    expect(readSignupRecovery()).toBeNull();
  });

  it("discards a record missing a required field", () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, cooldownUntil: null, expiresAt: Date.now() + 1000 })
    );
    expect(readSignupRecovery()).toBeNull();
  });
});
