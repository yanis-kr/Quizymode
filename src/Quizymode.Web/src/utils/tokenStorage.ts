/**
 * Utility functions for managing authentication tokens in localStorage
 */

const ACCESS_TOKEN_KEY = "accessToken";
const ID_TOKEN_KEY = "idToken";

/**
 * Get the ID token, falling back to access token if ID token is not available
 */
export const getToken = (): string | null => {
  return (
    localStorage.getItem(ID_TOKEN_KEY) || localStorage.getItem(ACCESS_TOKEN_KEY)
  );
};

/**
 * Check if a token exists
 */
export const hasToken = (): boolean => {
  return getToken() !== null;
};

/**
 * Store both access and ID tokens
 */
export const setTokens = (
  accessToken: string | null,
  idToken: string | null
): void => {
  if (accessToken) {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  }
  if (idToken) {
    localStorage.setItem(ID_TOKEN_KEY, idToken);
  }
};

/**
 * Remove both tokens from storage
 */
export const clearTokens = (): void => {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(ID_TOKEN_KEY);
};

/**
 * Check if a token is expired or will expire soon
 * @param token - The JWT token to check
 * @param bufferSeconds - Number of seconds before expiration to consider token expired (default: 60)
 * @returns true if token is expired or will expire soon, false otherwise
 */
export const isTokenExpired = (
  token: string | null,
  bufferSeconds: number = 60
): boolean => {
  if (!token) {
    return true;
  }

  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return true; // Invalid token format
    }

    const payload = JSON.parse(atob(parts[1]));
    const exp = payload.exp;

    if (!exp || typeof exp !== "number") {
      return true; // No expiration claim
    }

    const now = Math.floor(Date.now() / 1000);
    // Consider token expired if it expires within bufferSeconds
    return exp < now + bufferSeconds;
  } catch (error) {
    console.error("Error checking token expiration:", error);
    return true; // If we can't parse the token, consider it expired
  }
};

/**
 * Get token expiration time in seconds since epoch
 * @param token - The JWT token
 * @returns expiration time in seconds, or null if token is invalid or has no expiration
 */
export const getTokenExpiration = (token: string | null): number | null => {
  if (!token) {
    return null;
  }

  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }

    const payload = JSON.parse(atob(parts[1]));
    return payload.exp || null;
  } catch (error) {
    console.error("Error getting token expiration:", error);
    return null;
  }
};
