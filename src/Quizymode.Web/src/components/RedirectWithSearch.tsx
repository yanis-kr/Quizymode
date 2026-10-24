import { Navigate, useLocation } from "react-router-dom";

interface RedirectWithSearchProps {
  to: string;
}

/** Replace-redirect to a new pathname that keeps the current query string and hash (AC 2.2.5). */
const RedirectWithSearch = ({ to }: RedirectWithSearchProps) => {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}${location.hash}`} replace />;
};

export default RedirectWithSearch;
