import { afterEach, describe, expect, it, vi } from "vitest";
import { devTestAuthorization, parseDevTestUser } from "./devTestAuth";

// AC 7.8.3: the SPA sends the DevTest identity only in development builds that set VITE_DEV_TEST_USER.
describe("parseDevTestUser", () => {
  it.each([
    ["ci-user", { userId: "ci-user", isAdmin: false }],
    ["ci-user admin", { userId: "ci-user", isAdmin: true }],
    ["  user_1-2  ", { userId: "user_1-2", isAdmin: false }],
  ])("accepts %j", (raw, expected) => {
    expect(parseDevTestUser(raw)).toEqual(expected);
  });

  it.each([undefined, "", "   ", "ali;ce", "ci-user owner", "ci-user admin extra", "a".repeat(65)])(
    "rejects %j",
    (raw) => {
      expect(parseDevTestUser(raw)).toBeNull();
    },
  );
});

describe("devTestAuthorization", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds the DevTest header in development when a user is configured", () => {
    vi.stubEnv("VITE_DEV_TEST_USER", "ci-user");
    expect(devTestAuthorization()).toBe("DevTest ci-user");
  });

  it("carries the admin group only when configured with admin", () => {
    vi.stubEnv("VITE_DEV_TEST_USER", "ci-user admin");
    expect(devTestAuthorization()).toBe("DevTest ci-user admin");
  });

  it("returns null when no test user is configured", () => {
    vi.stubEnv("VITE_DEV_TEST_USER", "");
    expect(devTestAuthorization()).toBeNull();
  });

  it("returns null outside development, so production builds never send it", () => {
    vi.stubEnv("VITE_DEV_TEST_USER", "ci-user");
    vi.stubEnv("DEV", false);
    expect(devTestAuthorization()).toBeNull();
  });
});
