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

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401) {
      // If this is a retry after refresh, or we've already tried refreshing, clear auth
      if (originalRequest._retry) {
        clearTokens();

        // Check both current pathname and failed endpoint URL
        // Don't redirect if we're on a public route OR if the failed endpoint is public
        const publicRoutes = [
          "/",
          "/categories",
          "/login",
          "/signup",
          "/explore",
          "/quiz",
        ];

        // Public endpoints that don't require authentication
        const publicEndpoints = ["/categories", "/categories/"];

        const currentPath = window.location.pathname;
        const failedUrl = originalRequest?.url || "";

        // Check if current route is public
        const isPublicRoute = publicRoutes.some(
          (route) =>
            currentPath === route || currentPath.startsWith(route + "/")
        );

        // Check if failed endpoint is public (e.g., /categories or /categories/*/subcategories)
        const isPublicEndpoint =
          publicEndpoints.some((endpoint) => failedUrl.includes(endpoint)) ||
          /^\/categories\/[^\/]+\/subcategories/.test(failedUrl);

        // Only redirect if NOT on a public route AND failed endpoint is not public
        if (!isPublicRoute && !isPublicEndpoint) {
          // Add query parameter to indicate unauthorized access
          window.location.href = "/login?unauthorized=true";
        }
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
        // Refresh failed, clear tokens and redirect
        clearTokens();

        const publicRoutes = [
          "/",
          "/categories",
          "/login",
          "/signup",
          "/explore",
          "/quiz",
        ];

        const publicEndpoints = ["/categories", "/categories/"];

        const currentPath = window.location.pathname;
        const failedUrl = originalRequest?.url || "";

        const isPublicRoute = publicRoutes.some(
          (route) =>
            currentPath === route || currentPath.startsWith(route + "/")
        );

        const isPublicEndpoint =
          publicEndpoints.some((endpoint) => failedUrl.includes(endpoint)) ||
          /^\/categories\/[^\/]+\/subcategories/.test(failedUrl);

        if (!isPublicRoute && !isPublicEndpoint) {
          window.location.href = "/login?unauthorized=true";
        }
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);
