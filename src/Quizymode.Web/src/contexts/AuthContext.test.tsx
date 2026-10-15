import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, renderHook, waitFor, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthContext";

const mockSignIn = vi.fn();
const mockFetchAuthSession = vi.fn();
const mockSignOut = vi.fn();

vi.mock("aws-amplify/auth", () => ({
  fetchAuthSession: (...args: unknown[]) => mockFetchAuthSession(...args),
  signIn: (...args: unknown[]) => mockSignIn(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
  signUp: vi.fn(),
  confirmSignUp: vi.fn(),
}));

vi.mock("@/api/users", () => ({
  usersApi: { recordPolicyAcceptances: vi.fn() },
}));

vi.mock("@/features/legal/policyAcceptanceStorage", () => ({
  clearPendingPolicyAcceptances: vi.fn(),
  getPendingPolicyAcceptancesForEmail: () => [],
}));

vi.mock("@/utils/tokenStorage", () => ({
  hasToken: () => false,
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
}));

vi.mock("@/api/auth", () => ({
  authApi: { logoutAudit: vi.fn() },
}));

function fakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "none" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

function noSessionFetch() {
  return Promise.resolve({ tokens: undefined });
}

function validSessionFetch() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const accessToken = { toString: () => fakeJwt({ sub: "user-1", exp, "cognito:username": "user@example.com" }) };
  const idToken = { toString: () => fakeJwt({ email: "user@example.com", exp }) };
  return Promise.resolve({ tokens: { accessToken, idToken } });
}

function renderAuth() {
  return renderHook(() => useAuth(), { wrapper: AuthProvider });
}

describe("AuthContext.login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchAuthSession.mockImplementation(noSessionFetch);
  });

  it("resolves only once a verified session is established", async () => {
    mockSignIn.mockResolvedValueOnce({ isSignedIn: true, nextStep: { signInStep: "DONE" } });
    mockFetchAuthSession.mockImplementation(validSessionFetch);

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login("user@example.com", "password123");
    });

    expect(result.current.isAuthenticated).toBe(true);
  });

  it("throws rather than resolving when the provider reports an incomplete step", async () => {
    mockSignIn.mockResolvedValueOnce({
      isSignedIn: false,
      nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_SMS_CODE" },
    });

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => {
        await result.current.login("user@example.com", "password123");
      })
    ).rejects.toThrow(/additional step/i);
  });

  it("recovers from UserAlreadyAuthenticatedException by verifying the real session, not the message text", async () => {
    const alreadyAuthError = new Error("ignored message text");
    alreadyAuthError.name = "UserAlreadyAuthenticatedException";
    mockSignIn.mockRejectedValueOnce(alreadyAuthError);
    mockFetchAuthSession.mockImplementation(validSessionFetch);

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login("user@example.com", "password123");
    });

    expect(result.current.isAuthenticated).toBe(true);
  });

  it("rethrows UserAlreadyAuthenticatedException if no real session can actually be verified", async () => {
    const alreadyAuthError = new Error("ignored message text");
    alreadyAuthError.name = "UserAlreadyAuthenticatedException";
    mockSignIn.mockRejectedValueOnce(alreadyAuthError);
    mockFetchAuthSession.mockImplementation(noSessionFetch);

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => {
        await result.current.login("user@example.com", "password123");
      })
    ).rejects.toThrow();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("rejects on a real sign-in failure", async () => {
    mockSignIn.mockRejectedValueOnce(new Error("Incorrect username or password."));

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => {
        await result.current.login("user@example.com", "wrong");
      })
    ).rejects.toThrow(/incorrect username or password/i);
  });
});

describe("AuthContext smoke", () => {
  it("renders children without throwing", async () => {
    mockFetchAuthSession.mockImplementation(noSessionFetch);
    render(<AuthProvider>{null}</AuthProvider>);
    await waitFor(() => expect(mockFetchAuthSession).toHaveBeenCalled());
  });
});
