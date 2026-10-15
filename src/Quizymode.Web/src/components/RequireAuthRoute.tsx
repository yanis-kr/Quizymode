import { Navigate, Outlet, useLocation } from "react-router-dom";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useAuth } from "@/contexts/AuthContext";
import { LOGIN_PATH, buildAuthIntentQuery } from "@/features/auth/utils/authIntent";

interface RequireAuthRouteProps {
  requireAdmin?: boolean;
}

const RequireAuthRoute = ({
  requireAdmin = false,
}: RequireAuthRouteProps) => {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    const destination = `${location.pathname}${location.search}${location.hash}`;
    const query = buildAuthIntentQuery({ returnTo: destination });
    return <Navigate to={`${LOGIN_PATH}${query}`} replace />;
  }

  // Normal authorization still applies after sign-in: a non-admin returning
  // to an admin URL gets the existing denied/fallback behavior, not another
  // login loop (they're already authenticated -- /login would just bounce
  // them straight back here).
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

export default RequireAuthRoute;
