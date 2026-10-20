import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCognitoDomain, isGoogleSignInEnabled, resetMisconfigurationLogForTests } from "./googleSignInConfig";

describe("isGoogleSignInEnabled", () => {
  beforeEach(() => {
    resetMisconfigurationLogForTests();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("is off when the flag is absent", () => {
    vi.stubEnv("VITE_GOOGLE_SIGNIN_ENABLED", "");
    vi.stubEnv("VITE_COGNITO_DOMAIN", "auth.quizymode.com");
    expect(isGoogleSignInEnabled()).toBe(false);
  });

  it.each(["false", "TRUE", "1", "yes"])("is off for flag value %s (only exactly 'true' enables it)", (value) => {
    vi.stubEnv("VITE_GOOGLE_SIGNIN_ENABLED", value);
    vi.stubEnv("VITE_COGNITO_DOMAIN", "auth.quizymode.com");
    expect(isGoogleSignInEnabled()).toBe(false);
  });

  it("stays off, logs, and does not throw when the flag is on but the domain is missing", () => {
    vi.stubEnv("VITE_GOOGLE_SIGNIN_ENABLED", "true");
    vi.stubEnv("VITE_COGNITO_DOMAIN", "");
    expect(isGoogleSignInEnabled()).toBe(false);
    expect(isGoogleSignInEnabled()).toBe(false);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("is on when the flag is 'true' and a domain is set", () => {
    vi.stubEnv("VITE_GOOGLE_SIGNIN_ENABLED", "true");
    vi.stubEnv("VITE_COGNITO_DOMAIN", "auth.quizymode.com");
    expect(isGoogleSignInEnabled()).toBe(true);
  });

  it("normalizes a domain entered with a scheme or trailing slash", () => {
    vi.stubEnv("VITE_COGNITO_DOMAIN", "https://auth.quizymode.com/");
    expect(getCognitoDomain()).toBe("auth.quizymode.com");
  });
});
