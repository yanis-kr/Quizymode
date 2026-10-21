import { useQuery } from "@tanstack/react-query";
import { usersApi } from "@/api/users";
import { useAuth } from "@/contexts/AuthContext";

/**
 * The signed-in user's internal Quizymode id (`Users.Id`, from `GET /users/me`).
 * `createdBy` on collections, items and comments holds this id, not the token `sub`,
 * so ownership checks must compare against it. Null while loading or when signed out.
 */
export function useCurrentUserIdState(): {
  userId: string | null;
  isLoading: boolean;
  isError: boolean;
} {
  const { isAuthenticated, userId: subject } = useAuth();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["currentUser", "id", subject],
    queryFn: () => usersApi.getCurrent(),
    enabled: isAuthenticated && !!subject,
    retry: false,
    staleTime: Infinity,
  });
  return {
    userId: isAuthenticated ? (data?.id ?? null) : null,
    isLoading: isAuthenticated && isLoading,
    isError: isAuthenticated && isError,
  };
}

export function useCurrentUserId(): string | null {
  return useCurrentUserIdState().userId;
}
