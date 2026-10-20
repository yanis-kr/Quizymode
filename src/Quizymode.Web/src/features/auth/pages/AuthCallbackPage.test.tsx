import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";

type HubListener = (capsule: { payload: { event: string; data?: unknown } }) => void;
const { hubListeners, mockFetchAuthSession } = vi.hoisted(() => ({
  hubListeners: [] as HubListener[],
  mockFetchAuthSession: vi.fn(),
}));

vi.mock("aws-amplify/utils", () => ({
  Hub: {
    listen: (_channel: string, listener: HubListener) => {
      hubListeners.push(listener);
      return () => {
        hubListeners.splice(hubListeners.indexOf(listener), 1);
      };
    },
  },
}));
vi.mock("aws-amplify/auth", () => ({
  fetchAuthSession: (...args: unknown[]) => mockFetchAuthSession(...args),
  signInWithRedirect: vi.fn(),
}));

const mockRefreshAuth = vi.fn();
const mockSignInWithGoogle = vi.fn();
const mockNavigate = vi.fn();
const mockTrackSignInCompleted = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ refreshAuth: mockRefreshAuth, signInWithGoogle: mockSignInWithGoogle }),
}));
vi.mock("@/features/auth/utils/authAnalytics", () => ({
  trackSignInCompleted: (intent: unknown) => mockTrackSignInCompleted(intent),
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

import AuthCallbackPage from "./AuthCallbackPage";
import { installOAuthOutcomeListener, resetOAuthOutcomeForTests } from "@/features/auth/utils/oauthOutcome";
import { hasGoogleLinkRetried } from "@/features/auth/utils/googleSignIn";

function emit(event: string, data?: unknown) {
  act(() => {
    hubListeners.forEach((listener) => listener({ payload: { event, data } }));
  });
}

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={["/auth/callback"]}>
        <AuthCallbackPage />
      </MemoryRouter>
    </HelmetProvider>
  );
}

function install(search = "") {
  window.history.replaceState(null, "", `/auth/callback${search}`);
  installOAuthOutcomeListener();
  window.history.replaceState(null, "", "/auth/callback");
}

describe("AuthCallbackPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetOAuthOutcomeForTests();
    hubListeners.length = 0;
    mockRefreshAuth.mockReset();
    mockSignInWithGoogle.mockReset();
    mockNavigate.mockReset();
    mockTrackSignInCompleted.mockReset();
    mockFetchAuthSession.mockReset();
    mockRefreshAuth.mockResolvedValue(true);
    mockSignInWithGoogle.mockResolvedValue(undefined);
    mockFetchAuthSession.mockResolvedValue({ tokens: undefined });
  });

  afterEach(() => resetOAuthOutcomeForTests());

  it("on success refreshes the session, records sign-in once and navigates to the validated returnTo", async () => {
    install("?code=abc&state=xyz");
    renderPage();
    expect(screen.getByRole("heading", { name: "Signing you in…" })).toBeInTheDocument();

    emit("customOAuthState", JSON.stringify({ returnTo: "/collections?x=1", reason: "keep-collection" }));
    emit("signInWithRedirect");

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/collections?x=1", { replace: true }));
    expect(mockRefreshAuth).toHaveBeenCalledTimes(1);
    expect(mockTrackSignInCompleted).toHaveBeenCalledWith({ returnTo: "/collections?x=1", reason: "keep-collection" });
  });

  it("handles an outcome that fired before the page mounted", async () => {
    install("?code=abc&state=xyz");
    emit("signInWithRedirect");

    renderPage();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true }));
  });

  it("sends a hostile returnTo to the home page", async () => {
    install("?code=abc");
    renderPage();

    emit("customOAuthState", JSON.stringify({ returnTo: "https://evil.example/steal", reason: "x" }));
    emit("signInWithRedirect");

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true }));
    expect(mockTrackSignInCompleted).toHaveBeenCalledWith({ returnTo: "/", reason: null });
  });

  it("retries exactly once after the account-linked sentinel, setting the marker first", async () => {
    install("?code=abc");
    sessionStorage.setItem("qm.auth.googleIntent", JSON.stringify({ returnTo: "/quiz", reason: null }));
    renderPage();

    emit("signInWithRedirect_failure", { error: new Error("PreSignUp failed with error QM_ACCOUNT_LINKED.") });

    await waitFor(() =>
      expect(mockSignInWithGoogle).toHaveBeenCalledWith({ returnTo: "/quiz", reason: null }, { isRetry: true })
    );
    expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the generic failure and does not retry again when the linked error repeats", async () => {
    install("?code=abc");
    sessionStorage.setItem("qm.auth.googleLinkRetry", "1");
    sessionStorage.setItem("qm.auth.googleIntent", JSON.stringify({ returnTo: "/quiz", reason: null }));
    renderPage();

    emit("signInWithRedirect_failure", { error: new Error("PreSignUp failed with error QM_ACCOUNT_LINKED.") });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't finish signing you in with Google. Please try again, or use your email and password."
    );
    expect(mockSignInWithGoogle).not.toHaveBeenCalled();
    expect(hasGoogleLinkRetried()).toBe(true);
  });

  it("shows the unverified-email copy", async () => {
    install("?code=abc");
    renderPage();

    emit("signInWithRedirect_failure", {
      error: new Error("PreSignUp failed with error QM_GOOGLE_EMAIL_UNVERIFIED."),
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("Verify your email with Google first, then try again.");
    expect(screen.getByRole("heading", { name: "We couldn't sign you in" })).toHaveFocus();
  });

  it("shows the cancelled state without redirecting", async () => {
    install("?error=access_denied");
    renderPage();

    emit("signInWithRedirect_failure", { error: new Error("User cancelled OAuth flow.") });

    expect(await screen.findByRole("heading", { name: "Sign-in cancelled" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("You cancelled sign-in with Google. No changes were made.");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("never renders the raw error description", async () => {
    install("?code=abc");
    renderPage();

    emit("signInWithRedirect_failure", { error: new Error("invalid_request: secret internal detail 12345") });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong while signing you in with Google. Please try again."
    );
    expect(document.body).not.toHaveTextContent("secret internal detail");
  });

  it("keeps returnTo and reason on the error page's Back to sign in link", async () => {
    install("?code=abc");
    sessionStorage.setItem(
      "qm.auth.googleIntent",
      JSON.stringify({ returnTo: "/collections?x=1", reason: "keep-collection" })
    );
    renderPage();

    emit("signInWithRedirect_failure", { error: new Error("boom") });

    const back = await screen.findByRole("link", { name: "Back to sign in" });
    const href = back.getAttribute("href") ?? "";
    expect(href.startsWith("/login?")).toBe(true);
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("returnTo")).toBe("/collections?x=1");
    expect(params.get("reason")).toBe("keep-collection");
    expect(screen.getByRole("link", { name: "Use a different email to sign up" }).getAttribute("href")).toMatch(
      /^\/signup\?/
    );
  });

  it("falls back to an existing session when there was no redirect to process", async () => {
    install();
    mockFetchAuthSession.mockResolvedValue({ tokens: { accessToken: { toString: () => "token" } } });

    renderPage();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true }));
  });

  it("shows the generic error instead of spinning forever when there is nothing to process", async () => {
    install();

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong while signing you in");
  });

  it("maps an error parameter from the URL when no Hub event arrives", async () => {
    install("?error=access_denied&error_description=Permission+denied");

    renderPage();

    expect(await screen.findByRole("heading", { name: "Sign-in cancelled" })).toBeInTheDocument();
  });

  it("shows a generic error when the session cannot be established after success", async () => {
    install("?code=abc");
    mockRefreshAuth.mockResolvedValue(false);
    renderPage();

    emit("signInWithRedirect");

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
