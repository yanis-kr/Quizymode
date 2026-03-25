import type { AxiosError } from "axios";

/** RFC 7807 / ASP.NET Problem Details shape from the API */
interface ProblemDetails {
  title?: string;
  detail?: string;
  status?: number;
  type?: string;
}

/**
 * Extract a short, user-facing message from an API/axios error for debugging.
 * Use in ErrorMessage or console.
 */
export function getApiErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const ax = error as AxiosError<ProblemDetails>;
    const data = ax.response?.data;
    const status = ax.response?.status;
    if (data?.detail) return `[${status ?? "?"}] ${data.detail}`;
    if (data?.title) return `[${status ?? "?"}] ${data.title}`;
    if (status) return `HTTP ${status}: ${error.message}`;
    return error.message;
  }
  return String(error);
}
