import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthContext";
import { queueSignUpPolicyAcceptances } from "@/features/legal/policyAcceptanceStorage";

const mockFetchAuthSession = vi.fn();
const mockConfirmSignUp = vi.fn();
const mockAutoSignIn = vi.fn();
const mockRecord = vi.fn();

vi.mock("aws-amplify/auth", () => ({
  fetchAuthSession: (...args: unknown[]) => mockFetchAuthSession(...args),
  signIn: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
  confirmSignUp: (...args: unknown[]) => mockConfirmSignUp(...args),
  autoSignIn: (...args: unknown[]) => mockAutoSignIn(...args),
  resendSignUpCode: vi.fn(),
}));

vi.mock("@/api/users", () => ({
  usersApi: { recordPolicyAcceptances: (...args: unknown[]) => mockRecord(...args) },
}));

vi.mock("@/utils/tokenStorage", () => ({
  hasToken: () => false,
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
}));

vi.mock("@/api/auth", () => ({ authApi: { logoutAudit: vi.fn() } }));

const EMAIL = "new.person@example.com";

// Node 25 ships an experimental global localStorage that shadows jsdom's; use a plain in-memory Storage.
function installMemoryStorage(): void {
  const data = new Map<string, string>();
  const storage: Storage = {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => Array.from(data.keys())[index] ?? null,
    removeItem: (key) => { data.delete(key); },
    setItem: (key, value) => { data.set(key, String(value)); },
  };
  Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
}

function fakeJwt(payload: Record<string, unknown>): string {
  return `${btoa(JSON.stringify({ alg: "none" }))}.${btoa(JSON.stringify(payload))}.sig`;
}

/** Cognito can put the email in the access token, use the email as the username, or use the sub as the username. */
function session(access: Record<string, unknown>, id: Record<string, unknown>) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    tokens: {
      accessToken: { toString: () => fakeJwt({ sub: "sub-1", exp, ...access }) },
      idToken: { toString: () => fakeJwt({ sub: "sub-1", exp, ...id }) },
    },
  };
}

const SHAPES: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
  ["email claim on the access token", { email: EMAIL, username: "sub-1" }, { email: EMAIL }],
  ["username is the email", { username: EMAIL }, { email: EMAIL }],
  ["username is the sub, email only on the ID token", { username: "sub-1" }, { email: EMAIL }],
  ["cognito:username is the sub, email only on the ID token", { "cognito:username": "sub-1" }, { email: EMAIL }],
];

describe("pending policy acceptance sync after confirming a new account (#158)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMemoryStorage();
    mockConfirmSignUp.mockResolvedValue({ nextStep: { signUpStep: "COMPLETE_AUTO_SIGN_IN" } });
    mockAutoSignIn.mockResolvedValue({ isSignedIn: true });
    mockRecord.mockResolvedValue({ acceptances: [] });
  });

  it.each(SHAPES)("records the acceptance and clears the queue when %s", async (_name, access, id) => {
    mockFetchAuthSession.mockResolvedValueOnce({ tokens: undefined }); // initial mount: signed out
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    queueSignUpPolicyAcceptances(EMAIL, "2026-10-16T18:16:00.000Z");
    mockFetchAuthSession.mockResolvedValue(session(access, id));

    await act(async () => {
      await result.current.confirmSignup(EMAIL, "123456");
    });

    expect(mockRecord).toHaveBeenCalledTimes(1);
    const sent = mockRecord.mock.calls[0][0] as { acceptances: Array<{ policyType: string }> };
    expect(sent.acceptances.map((a) => a.policyType).sort()).toEqual(["PrivacyPolicy", "TermsOfService"]);
    expect(window.localStorage.getItem("PendingPolicyAcceptancesV1")).toBeNull();
  });

  it("keeps the queue for a retry when the API call fails", async () => {
    mockFetchAuthSession.mockResolvedValueOnce({ tokens: undefined });
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    queueSignUpPolicyAcceptances(EMAIL, "2026-10-16T18:16:00.000Z");
    mockFetchAuthSession.mockResolvedValue(session({ username: EMAIL }, { email: EMAIL }));
    mockRecord.mockRejectedValueOnce(new Error("503"));

    await act(async () => {
      await result.current.confirmSignup(EMAIL, "123456");
    });

    expect(window.localStorage.getItem("PendingPolicyAcceptancesV1")).not.toBeNull();
  });

  it("reports the sync as settled only after the queued acceptance was sent (#222)", async () => {
    mockFetchAuthSession.mockResolvedValueOnce({ tokens: undefined });
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.policyAcceptancesSynced).toBe(false);

    queueSignUpPolicyAcceptances(EMAIL, "2026-10-16T18:16:00.000Z");
    mockFetchAuthSession.mockResolvedValue(session({ username: EMAIL }, { email: EMAIL }));
    let syncedWhenRecorded: boolean | undefined;
    mockRecord.mockImplementationOnce(async () => {
      syncedWhenRecorded = result.current.policyAcceptancesSynced;
      return { acceptances: [] };
    });

    await act(async () => {
      await result.current.confirmSignup(EMAIL, "123456");
    });

    expect(syncedWhenRecorded).toBe(false);
    expect(result.current.policyAcceptancesSynced).toBe(true);
  });
});
