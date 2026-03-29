import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { analyticsApi } from "@/api/analytics";
import { useAuth } from "@/contexts/AuthContext";
import {
  getPageViewSessionId,
  shouldTrackPageView,
} from "@/utils/pageViewTracking";

const PageViewTracker = () => {
  const location = useLocation();
  const { isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const path = location.pathname || "/";
    const queryString = location.search || "";

    if (!shouldTrackPageView(path, queryString)) {
      return;
    }

    void analyticsApi
      .trackPageView({
        path,
        queryString,
        sessionId: getPageViewSessionId(),
      })
      .catch((error) => {
        console.debug("Page view tracking failed", error);
      });
  }, [isLoading, location.pathname, location.search]);

  return null;
};

export default PageViewTracker;
