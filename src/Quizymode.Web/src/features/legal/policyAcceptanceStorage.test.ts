import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PRIVACY_POLICY_VERSION,
  TERMS_OF_SERVICE_POLICY_VERSION,
  clearPendingPolicyAcceptances,
  getPendingPolicyAcceptancesForEmail,
  queueSignUpPolicyAcceptances,
} from "./policyAcceptanceStorage";

function createStorage(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear: () => {
      store.clear();
    },
    getItem: (key: string) => {
      return store.get(key) ?? null;
    },
    key: (index: number) => {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  } as Storage;
}

describe("policyAcceptanceStorage", () => {
  beforeEach(() => {
    const storage = createStorage();
    vi.stubGlobal("localStorage", storage);
    Object.defineProperty(window, "localStorage", {
      value: storage,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("queues and retrieves pending policy acceptances for the normalized email", () => {
    queueSignUpPolicyAcceptances(
      "  Student@Example.com  ",
      "2026-04-03T12:00:00Z"
    );

    expect(getPendingPolicyAcceptancesForEmail("student@example.com")).toEqual([
      {
        policyType: "TermsOfService",
        policyVersion: TERMS_OF_SERVICE_POLICY_VERSION,
        acceptedAtUtc: "2026-04-03T12:00:00Z",
      },
      {
        policyType: "PrivacyPolicy",
        policyVersion: PRIVACY_POLICY_VERSION,
        acceptedAtUtc: "2026-04-03T12:00:00Z",
      },
    ]);
  });

  it("returns an empty list for missing email, mismatched email, or malformed acceptances", () => {
    queueSignUpPolicyAcceptances("student@example.com", "2026-04-03T12:00:00Z");

    expect(getPendingPolicyAcceptancesForEmail(null)).toEqual([]);
    expect(getPendingPolicyAcceptancesForEmail("other@example.com")).toEqual([]);

    localStorage.setItem(
      "PendingPolicyAcceptancesV1",
      JSON.stringify({
        email: "student@example.com",
        acceptances: [{ policyType: 123 }],
      })
    );

    expect(getPendingPolicyAcceptancesForEmail("student@example.com")).toEqual([]);
  });

  it("returns an empty list when stored JSON cannot be parsed", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    localStorage.setItem("PendingPolicyAcceptancesV1", "{bad json");

    expect(getPendingPolicyAcceptancesForEmail("student@example.com")).toEqual(
      []
    );
    expect(consoleErrorSpy).toHaveBeenCalledOnce();
  });

  it("clears pending policy acceptances", () => {
    queueSignUpPolicyAcceptances("student@example.com", "2026-04-03T12:00:00Z");

    clearPendingPolicyAcceptances();

    expect(getPendingPolicyAcceptancesForEmail("student@example.com")).toEqual(
      []
    );
  });
});
