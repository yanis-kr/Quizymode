import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSignInWithRedirect } = vi.hoisted(() => ({ mockSignInWithRedirect: vi.fn() }));

vi.mock("aws-amplify/auth", () => ({ signInWithRedirect: mockSignInWithRedirect }));

import {
  hasGoogleLinkRetried,
  readStoredGoogleIntent,
  sanitizeIntent,
  startGoogleSignIn,
} from "./googleSignIn";

describe("startGoogleSignIn", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockSignInWithRedirect.mockReset();
    mockSignInWithRedirect.mockResolvedValue(undefined);
  });

  it("persists the validated intent and passes it as custom state to the Google redirect", async () => {
    await startGoogleSignIn({ returnTo: "/collections?x=1", reason: "keep-collection" });

    expect(readStoredGoogleIntent()).toEqual({ returnTo: "/collections?x=1", reason: "keep-collection" });
    expect(mockSignInWithRedirect).toHaveBeenCalledWith({
      provider: "Google",
      customState: JSON.stringify({ returnTo: "/collections?x=1", reason: "keep-collection" }),
    });
  });

  it("never sends an external returnTo or unknown reason", async () => {
    await startGoogleSignIn({ returnTo: "https://evil.example/", reason: "nope" as never });

    expect(mockSignInWithRedirect).toHaveBeenCalledWith({
      provider: "Google",
      customState: JSON.stringify({ returnTo: "/", reason: null }),
    });
  });

  it("sets the link-retry marker before redirecting on a retry, and clears it on a user-initiated click", async () => {
    mockSignInWithRedirect.mockImplementation(async () => {
      expect(hasGoogleLinkRetried()).toBe(true);
    });
    await startGoogleSignIn({ returnTo: "/", reason: null }, { isRetry: true });
    expect(hasGoogleLinkRetried()).toBe(true);

    mockSignInWithRedirect.mockImplementation(async () => undefined);
    await startGoogleSignIn({ returnTo: "/", reason: null });
    expect(hasGoogleLinkRetried()).toBe(false);
  });
});

describe("sanitizeIntent / stored intent", () => {
  beforeEach(() => sessionStorage.clear());

  it("re-validates a tampered stored intent on read", () => {
    sessionStorage.setItem("qm.auth.googleIntent", JSON.stringify({ returnTo: "//evil.example", reason: "x" }));
    expect(readStoredGoogleIntent()).toEqual({ returnTo: "/", reason: null });
  });

  it("ignores malformed JSON", () => {
    sessionStorage.setItem("qm.auth.googleIntent", "{not json");
    expect(readStoredGoogleIntent()).toBeNull();
  });

  it("falls back to defaults for non-objects", () => {
    expect(sanitizeIntent(42)).toEqual({ returnTo: "/", reason: null });
  });
});
