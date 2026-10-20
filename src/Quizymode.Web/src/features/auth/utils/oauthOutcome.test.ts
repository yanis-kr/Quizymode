import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type HubListener = (capsule: { payload: { event: string; data?: unknown } }) => void;
const { hubListeners } = vi.hoisted(() => ({ hubListeners: [] as HubListener[] }));

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

import {
  clearOAuthOutcome,
  getInitialOAuthParams,
  getOAuthOutcome,
  installOAuthOutcomeListener,
  resetOAuthOutcomeForTests,
  subscribeOAuthOutcome,
} from "./oauthOutcome";

function emit(event: string, data?: unknown) {
  hubListeners.forEach((listener) => listener({ payload: { event, data } }));
}

describe("oauthOutcome", () => {
  beforeEach(() => {
    resetOAuthOutcomeForTests();
    hubListeners.length = 0;
    window.history.replaceState(null, "", "/auth/callback");
  });

  afterEach(() => resetOAuthOutcomeForTests());

  it("keeps an outcome that fires before anyone subscribes", () => {
    installOAuthOutcomeListener();

    emit("signInWithRedirect_failure", { error: new Error("PreSignUp failed with error QM_ACCOUNT_LINKED.") });

    expect(getOAuthOutcome()).toMatchObject({
      status: "failure",
      message: "PreSignUp failed with error QM_ACCOUNT_LINKED.",
    });
  });

  it("records success and the custom state, and notifies subscribers", () => {
    installOAuthOutcomeListener();
    const subscriber = vi.fn();
    const unsubscribe = subscribeOAuthOutcome(subscriber);

    emit("customOAuthState", '{"returnTo":"/x"}');
    emit("signInWithRedirect");
    unsubscribe();

    expect(getOAuthOutcome()).toMatchObject({ status: "success", customState: '{"returnTo":"/x"}' });
    expect(subscriber).toHaveBeenCalledTimes(2);
  });

  it("installs only once", () => {
    installOAuthOutcomeListener();
    installOAuthOutcomeListener();
    expect(hubListeners).toHaveLength(1);
  });

  it("captures the redirect parameters before Amplify can rewrite the URL", () => {
    window.history.replaceState(null, "", "/auth/callback?error=access_denied&error_description=nope");
    installOAuthOutcomeListener();
    window.history.replaceState(null, "", "/auth/callback");

    expect(getInitialOAuthParams()).toEqual({ hasCode: false, error: "access_denied", errorDescription: "nope" });
  });

  it("clears the outcome", () => {
    installOAuthOutcomeListener();
    emit("signInWithRedirect");
    clearOAuthOutcome();
    expect(getOAuthOutcome().status).toBe("none");
  });
});
