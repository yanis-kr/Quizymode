import { useQuery } from "@tanstack/react-query";
import { usersApi } from "@/api/users";
import { useAuth } from "@/contexts/AuthContext";

/**
 * The signed-in user's internal Quizymode id (`Users.Id`, from `GET /users/me`).
 * `createdBy` on collections, items and comments holds this id, not the token `sub`,
 * so ownership checks must compare against it. Null while loading or when signed out.
 */
export function useCurrentUserId(): string | null {
  const { isAuthenticated, userId: subject } = useAuth();
  const { data } = useQuery({
    queryKey: ["currentUser", "id", subject],
    queryFn: () => usersApi.getCurrent(),
    enabled: isAuthenticated && !!subject,
    retry: false,
    staleTime: Infinity,
  });
  return isAuthenticated ? (data?.id ?? null) : null;
}
