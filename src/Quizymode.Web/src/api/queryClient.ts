import { QueryClient } from "@tanstack/react-query";

/** The app-wide React Query client. A module singleton so sign-out can purge per-user cache entries. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
