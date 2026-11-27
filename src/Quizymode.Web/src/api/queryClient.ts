import { QueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";

/** The app-wide React Query client. A module singleton so sign-out can purge per-user cache entries. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // One retry, except for a rate limit or quota refusal: repeating it only spends more of the budget.
      retry: (failureCount, error) =>
        !(isAxiosError(error) && error.response?.status === 429) && failureCount < 1,
    },
  },
});
