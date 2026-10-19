import type { AxiosError } from "axios";
import { getApiErrorMessage } from "@/utils/apiError";

interface IdeaProblemDetails {
  title?: string;
}

const IDEA_ERROR_COPY: Record<string, string> = {
  "Ideas.Duplicate":
    "You already submitted an idea with this same content. Try editing your existing idea or describing a different one.",
  "Ideas.DailyLimitExceeded":
    "You have reached the daily limit for sharing ideas. Please try again tomorrow.",
  "Ideas.ProfanityBlocked":
    "Your idea contains language we can't publish. Please reword it and try again.",
  "IdeaComments.ProfanityBlocked":
    "Your comment contains language we can't publish. Please reword it and try again.",
  "Ideas.InvalidStatusTransition":
    "That lifecycle change isn't allowed from the idea's current status.",
  "Ideas.StatusRequiresPublished":
    "Only published ideas can change lifecycle status. Approve the idea first.",
};

const RATE_LIMIT_COPY =
  "You're doing that too quickly. Please wait a few minutes and try again.";

/**
 * Map known Ideas API error codes (carried in the ProblemDetails title) and
 * rate-limit responses to specific, actionable copy; fall back to the generic
 * API error message for anything else.
 */
export function getIdeaErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const ax = error as AxiosError<IdeaProblemDetails>;
    if (ax.response?.status === 429) {
      return RATE_LIMIT_COPY;
    }

    const code = ax.response?.data?.title;
    if (code && IDEA_ERROR_COPY[code]) {
      return IDEA_ERROR_COPY[code];
    }
  }

  return getApiErrorMessage(error);
}
