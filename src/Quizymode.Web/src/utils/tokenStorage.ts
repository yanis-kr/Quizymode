/**
 * Utility functions for managing authentication tokens in localStorage
 */

const ACCESS_TOKEN_KEY = "accessToken";
const ID_TOKEN_KEY = "idToken";

/**
 * Get the ID token, falling back to access token if ID token is not available
 */
export const getToken = (): string | null => {
  return localStorage.getItem(ID_TOKEN_KEY) || localStorage.getItem(ACCESS_TOKEN_KEY);
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
export const setTokens = (accessToken: string | null, idToken: string | null): void => {
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

