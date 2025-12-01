import axios from "axios";
import type { AxiosInstance, InternalAxiosRequestConfig } from "axios";

const API_URL = import.meta.env.VITE_API_URL || "https://localhost:8080";

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor to add auth token
// IMPORTANT: Use ID token (not access token) for API calls
// ID tokens have the correct audience claim for API validation
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Use ID token for API calls (access token is for AWS services)
    const token =
      localStorage.getItem("idToken") || localStorage.getItem("accessToken");
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
    if (error.response?.status === 401) {
      // Token expired or invalid - clear storage
      localStorage.removeItem("accessToken");
      localStorage.removeItem("idToken");

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
      const failedUrl = error.config?.url || "";

      // Check if current route is public
      const isPublicRoute = publicRoutes.some(
        (route) => currentPath === route || currentPath.startsWith(route + "/")
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
    return Promise.reject(error);
  }
);
