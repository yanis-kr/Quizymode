import axios from "axios";
import type { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { getToken, clearTokens, isTokenExpired } from "@/utils/tokenStorage";
import { fetchAuthSession } from "aws-amplify/auth";
import { setTokens } from "@/utils/tokenStorage";

const API_URL = import.meta.env.VITE_API_URL || "https://localhost:8080";

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Track if we're currently refreshing to avoid multiple simultaneous refresh attempts
let isRefreshing = false;
let refreshPromise: Promise<void> | null = null;

/**
 * Refresh authentication tokens using AWS Amplify
 * This will automatically use the refresh token if available
 */
const refreshTokens = async (): Promise<void> => {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      // fetchAuthSession will automatically refresh tokens if they're expired
      // and a refresh token is available
      const session = await fetchAuthSession({ forceRefresh: true });

      if (session.tokens?.accessToken && session.tokens?.idToken) {
        const accessToken = session.tokens.accessToken.toString();
        const idToken = session.tokens.idToken.toString();
        setTokens(accessToken, idToken);
      } else {
        // No tokens available, clear auth state
        clearTokens();
        throw new Error("No tokens available after refresh");
      }
    } catch (error) {
      console.error("Token refresh failed:", error);
      clearTokens();
      throw error;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

// Request interceptor to add auth token and refresh if needed
// IMPORTANT: Use ID token (not access token) for API calls
// ID tokens have the correct audience claim for API validation
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    let token = getToken();

    // Check if token is expired or about to expire
    if (token && isTokenExpired(token)) {
      try {
        // Try to refresh the token
        await refreshTokens();
        token = getToken();
      } catch (error) {
        // Refresh failed, token will be null
        token = null;
      }
    }

    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Helper to check if current location is a public route
const isOnPublicRoute = (): boolean => {
  const publicRoutes = [
    "/",
    "/categories",
    "/login",
    "/signup",
    "/explore",
    "/quiz",
  ];
  const currentPath = window.location.pathname;
  return publicRoutes.some(
    (route) => currentPath === route || currentPath.startsWith(route + "/")
  );
};

// Helper to check if an endpoint is public
const isPublicEndpoint = (url: string): boolean => {
  const publicEndpoints = ["/categories", "/categories/", "/keywords", "/items"];
  return (
    publicEndpoints.some((endpoint) => url.includes(endpoint)) ||
    /^\/categories\/[^\/]+\/subcategories/.test(url)
  );
};

// Helper to handle auth failure - redirect to main page instead of login
const handleAuthFailure = (originalRequest?: { url?: string }): void => {
  clearTokens();

  const failedUrl = originalRequest?.url || "";

  // Don't redirect if already on a public route or if the failed endpoint is public
  if (!isOnPublicRoute() && !isPublicEndpoint(failedUrl)) {
    // Redirect to main page (which doesn't require auth) instead of login
    window.location.href = "/";
  }
};

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;

    // Handle 401 (Unauthorized) and 403 (Forbidden/Access Denied) errors
    if (status === 401 || status === 403) {
      // If this is a retry after refresh, or we've already tried refreshing, clear auth
      if (originalRequest._retry) {
        handleAuthFailure(originalRequest);
        return Promise.reject(error);
      }

      // Try to refresh the token once
      try {
        originalRequest._retry = true;
        await refreshTokens();

        // Retry the original request with the new token
        const newToken = getToken();
        if (newToken && originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }

        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed, clear tokens and redirect to main page
        handleAuthFailure(originalRequest);
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);
