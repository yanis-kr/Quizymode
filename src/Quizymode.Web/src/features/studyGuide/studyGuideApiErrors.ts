import { isAxiosError } from "axios";

export interface ApiErrorInfo {
  status?: number;
  /** ProblemDetails `title` (the error code for domain errors, e.g. `StudyGuideDocument.QuotaExceeded`). */
  code?: string;
  message: string;
}

/** Reads ProblemDetails / FluentValidation payloads into a user-facing message. */
export function readApiError(error: unknown, fallback = "Something went wrong."): ApiErrorInfo {
  if (!isAxiosError(error)) {
    return { message: error instanceof Error && error.message ? error.message : fallback };
  }

  const status = error.response?.status;
  const data: unknown = error.response?.data;
  let code: string | undefined;
  let message: string | undefined;

  if (Array.isArray(data)) {
    const first = data.find(
      (entry): entry is { errorMessage: string } =>
        !!entry &&
        typeof entry === "object" &&
        typeof (entry as { errorMessage?: unknown }).errorMessage === "string"
    );
    if (first) message = first.errorMessage;
  } else if (data && typeof data === "object") {
    const problem = data as { title?: unknown; detail?: unknown; errors?: unknown };
    if (typeof problem.title === "string") code = problem.title;
    if (typeof problem.detail === "string" && problem.detail.trim()) message = problem.detail;
    if (!message && problem.errors && typeof problem.errors === "object") {
      const firstList = Object.values(problem.errors as Record<string, unknown>).find(Array.isArray);
      const firstMessage = Array.isArray(firstList) ? firstList[0] : undefined;
      if (typeof firstMessage === "string") message = firstMessage;
    }
  }

  return { status, code, message: message ?? fallback };
}
