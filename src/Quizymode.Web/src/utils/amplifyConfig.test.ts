import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockConfigure } = vi.hoisted(() => ({ mockConfigure: vi.fn() }));

vi.mock("aws-amplify", () => ({ Amplify: { configure: mockConfigure } }));

async function configure() {
  vi.resetModules();
  const module = await import("./amplifyConfig");
  module.configureAmplify();
  return mockConfigure.mock.calls[0][0] as {
    Auth: { Cognito: Record<string, unknown> };
  };
}

describe("configureAmplify", () => {
  beforeEach(() => {
    mockConfigure.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("VITE_COGNITO_USER_POOL_ID", "us-east-1_pool");
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "client-id");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("adds no OAuth configuration when Google sign-in is off", async () => {
    vi.stubEnv("VITE_GOOGLE_SIGNIN_ENABLED", "");
    vi.stubEnv("VITE_COGNITO_DOMAIN", "auth.quizymode.com");

    const config = await configure();

    expect(config.Auth.Cognito).toEqual({ userPoolId: "us-east-1_pool", userPoolClientId: "client-id" });
  });

  it("adds no OAuth configuration, and does not throw, when the flag is on without a domain", async () => {
    vi.stubEnv("VITE_GOOGLE_SIGNIN_ENABLED", "true");
    vi.stubEnv("VITE_COGNITO_DOMAIN", "");

    const config = await configure();

    expect(config.Auth.Cognito).not.toHaveProperty("loginWith");
    expect(console.error).toHaveBeenCalled();
  });

  it("configures code + PKCE OAuth for Google with the dedicated callback route when on", async () => {
    vi.stubEnv("VITE_GOOGLE_SIGNIN_ENABLED", "true");
    vi.stubEnv("VITE_COGNITO_DOMAIN", "auth.quizymode.com");

    const config = await configure();

    expect(config.Auth.Cognito.loginWith).toEqual({
      oauth: {
        domain: "auth.quizymode.com",
        scopes: ["openid", "email", "profile"],
        redirectSignIn: [`${window.location.origin}/auth/callback`],
        redirectSignOut: [`${window.location.origin}/`],
        responseType: "code",
        providers: ["Google"],
      },
    });
    expect(JSON.stringify(config)).not.toMatch(/secret/i);
  });
});
