import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, renderHook, waitFor, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthContext";
import { clearTokens } from "@/utils/tokenStorage";

const mockSignIn = vi.fn();
const mockFetchAuthSession = vi.fn();
const mockSignOut = vi.fn();
const mockSignUp = vi.fn();
const mockConfirmSignUp = vi.fn();
const mockAutoSignIn = vi.fn();
const mockResendSignUpCode = vi.fn();

vi.mock("aws-amplify/auth", () => ({
  fetchAuthSession: (...args: unknown[]) => mockFetchAuthSession(...args),
  signIn: (...args: unknown[]) => mockSignIn(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
  signUp: (...args: unknown[]) => mockSignUp(...args),
  confirmSignUp: (...args: unknown[]) => mockConfirmSignUp(...args),
  autoSignIn: (...args: unknown[]) => mockAutoSignIn(...args),
  resendSignUpCode: (...args: unknown[]) => mockResendSignUpCode(...args),
  signInWithRedirect: vi.fn(),
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

describe("AuthContext.signup/confirmSignup/resendConfirmationCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchAuthSession.mockImplementation(noSessionFetch);
  });

  it("requests autoSignIn when signing up", async () => {
    mockSignUp.mockResolvedValueOnce({ nextStep: { signUpStep: "CONFIRM_SIGN_UP" } });
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.signup("alice", "Password123", "alice@example.com");
    });

    expect(mockSignUp).toHaveBeenCalledWith(
      expect.objectContaining({ options: expect.objectContaining({ autoSignIn: true }) })
    );
  });

  it("calls autoSignIn and verifies a real session when the provider reports COMPLETE_AUTO_SIGN_IN", async () => {
    mockConfirmSignUp.mockResolvedValueOnce({ nextStep: { signUpStep: "COMPLETE_AUTO_SIGN_IN" } });
    mockAutoSignIn.mockResolvedValueOnce({ isSignedIn: true });
    mockFetchAuthSession.mockImplementation(validSessionFetch);

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let authenticated: boolean | undefined;
    await act(async () => {
      authenticated = await result.current.confirmSignup("alice@example.com", "123456");
    });

    expect(mockAutoSignIn).toHaveBeenCalledTimes(1);
    expect(authenticated).toBe(true);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("does not call autoSignIn when the provider reports DONE, but still verifies via refreshAuth", async () => {
    mockConfirmSignUp.mockResolvedValueOnce({ nextStep: { signUpStep: "DONE" } });
    mockFetchAuthSession.mockImplementation(noSessionFetch);

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let authenticated: boolean | undefined;
    await act(async () => {
      authenticated = await result.current.confirmSignup("alice@example.com", "123456");
    });

    expect(mockAutoSignIn).not.toHaveBeenCalled();
    // Confirmation completion alone is not sufficient evidence -- no
    // verifiable session here, so this must resolve false, not true.
    expect(authenticated).toBe(false);
  });

  it("resolves false rather than rejecting when autoSignIn throws (e.g. AutoSignInException) after confirmation already succeeded", async () => {
    mockConfirmSignUp.mockResolvedValueOnce({ nextStep: { signUpStep: "COMPLETE_AUTO_SIGN_IN" } });
    const autoSignInError = new Error("The autoSignIn flow has not started or already completed.");
    autoSignInError.name = "AutoSignInException";
    mockAutoSignIn.mockRejectedValueOnce(autoSignInError);
    mockFetchAuthSession.mockImplementation(noSessionFetch);

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let authenticated: boolean | undefined;
    await act(async () => {
      // The account IS confirmed at this point (confirmSignUp already
      // succeeded) -- this must not reject, or the caller has no way to
      // clear pending confirmation state or route the user anywhere.
      authenticated = await result.current.confirmSignup("alice@example.com", "123456");
    });

    expect(authenticated).toBe(false);
  });

  it("resolves false, not true, when auto-sign-in reports a step but no real session can be verified", async () => {
    mockConfirmSignUp.mockResolvedValueOnce({ nextStep: { signUpStep: "COMPLETE_AUTO_SIGN_IN" } });
    mockAutoSignIn.mockResolvedValueOnce({ isSignedIn: false });
    mockFetchAuthSession.mockImplementation(noSessionFetch);

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let authenticated: boolean | undefined;
    await act(async () => {
      authenticated = await result.current.confirmSignup("alice@example.com", "123456");
    });

    expect(authenticated).toBe(false);
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("propagates a code-mismatch error without calling autoSignIn or refreshAuth", async () => {
    const codeMismatch = new Error("raw message");
    codeMismatch.name = "CodeMismatchException";
    mockConfirmSignUp.mockRejectedValueOnce(codeMismatch);

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => {
        await result.current.confirmSignup("alice@example.com", "000000");
      })
    ).rejects.toThrow();
    expect(mockAutoSignIn).not.toHaveBeenCalled();
  });

  it("resends the confirmation code for the given username and propagates failures", async () => {
    mockResendSignUpCode.mockResolvedValueOnce({});
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.resendConfirmationCode("alice@example.com");
    });
    expect(mockResendSignUpCode).toHaveBeenCalledWith({ username: "alice@example.com" });

    mockResendSignUpCode.mockRejectedValueOnce(new Error("LimitExceededException"));
    await expect(
      act(async () => {
        await result.current.resendConfirmationCode("alice@example.com");
      })
    ).rejects.toThrow();
  });
});

describe("AuthContext smoke", () => {
  it("renders children without throwing", async () => {
    mockFetchAuthSession.mockImplementation(noSessionFetch);
    render(<AuthProvider>{null}</AuthProvider>);
    await waitFor(() => expect(mockFetchAuthSession).toHaveBeenCalled());
  });
});

describe("AuthContext.logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchAuthSession.mockImplementation(noSessionFetch);
  });

  it("clears stored tokens before signOut so a Google hosted-logout redirect cannot leave them behind", async () => {
    const order: string[] = [];
    vi.mocked(clearTokens).mockImplementation(() => {
      order.push("clearTokens");
    });
    mockSignOut.mockImplementation(async () => {
      order.push("signOut");
    });

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    order.length = 0;

    await act(async () => {
      await result.current.logout();
    });

    expect(order.slice(0, 2)).toEqual(["clearTokens", "signOut"]);
  });
});
