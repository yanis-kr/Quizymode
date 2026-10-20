import { describe, expect, it } from "vitest";
import {
  GOOGLE_AUTH_ERROR_COPY,
  QM_ACCOUNT_LINKED,
  QM_GOOGLE_EMAIL_UNVERIFIED,
  QM_USE_GOOGLE,
  hasSentinel,
  mapGoogleFailure,
} from "./googleAuthErrors";

describe("hasSentinel", () => {
  it("matches the sentinel inside Cognito's wrapped message", () => {
    expect(hasSentinel("PreSignUp failed with error QM_ACCOUNT_LINKED.", QM_ACCOUNT_LINKED)).toBe(true);
    expect(hasSentinel("PreSignUp failed with error QM_USE_GOOGLE.", QM_USE_GOOGLE)).toBe(true);
  });

  it("matches only whole tokens", () => {
    expect(hasSentinel("XQM_ACCOUNT_LINKED", QM_ACCOUNT_LINKED)).toBe(false);
    expect(hasSentinel("QM_ACCOUNT_LINKED_EXTRA", QM_ACCOUNT_LINKED)).toBe(false);
    expect(hasSentinel("something else", QM_ACCOUNT_LINKED)).toBe(false);
    expect(hasSentinel(null, QM_ACCOUNT_LINKED)).toBe(false);
  });
});

describe("mapGoogleFailure", () => {
  it("maps the unverified-email sentinel", () => {
    expect(mapGoogleFailure(`PreSignUp failed with error ${QM_GOOGLE_EMAIL_UNVERIFIED}.`)).toBe("email-unverified");
  });

  it("maps cancellation", () => {
    expect(mapGoogleFailure("User cancelled OAuth flow.")).toBe("cancelled");
    expect(mapGoogleFailure("access_denied")).toBe("cancelled");
  });

  it("maps everything else to generic", () => {
    expect(mapGoogleFailure("invalid_request: something odd")).toBe("generic");
    expect(mapGoogleFailure("")).toBe("generic");
    expect(mapGoogleFailure(undefined)).toBe("generic");
  });

  it("has the agreed copy for each code", () => {
    expect(GOOGLE_AUTH_ERROR_COPY["email-unverified"]).toBe("Verify your email with Google first, then try again.");
    expect(GOOGLE_AUTH_ERROR_COPY.cancelled).toBe("You cancelled sign-in with Google. No changes were made.");
    expect(GOOGLE_AUTH_ERROR_COPY.generic).toBe(
      "Something went wrong while signing you in with Google. Please try again."
    );
    expect(GOOGLE_AUTH_ERROR_COPY["linked-retry-failed"]).toBe(
      "We couldn't finish signing you in with Google. Please try again, or use your email and password."
    );
  });
});
