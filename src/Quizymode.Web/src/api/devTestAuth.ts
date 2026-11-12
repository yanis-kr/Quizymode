// Development-only test sign-in (AC 7.8.3).
// Vite replaces import.meta.env.DEV with false in production builds, so nothing in this module
// reaches a production bundle. The identity comes from VITE_DEV_TEST_USER, for example "ci-user" or "ci-user admin".

export interface DevTestIdentity {
  userId: string;
  isAdmin: boolean;
}

const USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export const parseDevTestUser = (raw: string | undefined): DevTestIdentity | null => {
  if (!raw) {
    return null;
  }

  const parts = raw.trim().split(/\s+/);
  if (parts.length === 0 || parts.length > 2 || !USER_ID_PATTERN.test(parts[0])) {
    return null;
  }

  if (parts.length === 2 && parts[1] !== "admin") {
    return null;
  }

  return { userId: parts[0], isAdmin: parts.length === 2 };
};

// The early return on import.meta.env.DEV lets the bundler drop the rest of each function from production builds.
export const devTestIdentity = (): DevTestIdentity | null => {
  if (!import.meta.env.DEV) {
    return null;
  }

  return parseDevTestUser(import.meta.env.VITE_DEV_TEST_USER);
};

export const devTestAuthorization = (): string | null => {
  if (!import.meta.env.DEV) {
    return null;
  }

  const identity = parseDevTestUser(import.meta.env.VITE_DEV_TEST_USER);
  if (!identity) {
    return null;
  }

  return identity.isAdmin ? `DevTest ${identity.userId} admin` : `DevTest ${identity.userId}`;
};
