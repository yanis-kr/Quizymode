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
      // Token expired or invalid - clear storage BEFORE redirecting
      // This ensures auth state is cleared before LoginPage loads
      localStorage.removeItem("accessToken");
      localStorage.removeItem("idToken");
      // Add query parameter to indicate unauthorized access
      window.location.href = "/login?unauthorized=true";
      return Promise.reject(error);
    }
    return Promise.reject(error);
  }
);
