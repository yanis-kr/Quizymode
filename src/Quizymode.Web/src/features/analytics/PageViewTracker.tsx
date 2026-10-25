import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { analyticsApi, type TrackPageViewRequest } from "@/api/analytics";
import { useAuth } from "@/contexts/AuthContext";
import { getCapturedAttribution } from "@/utils/attributionCapture";
import {
  getPageViewSessionId,
  isAdminPath,
  isAuthCallbackPath,
  isInternalBrowser,
  shouldTrackPageView,
  stripRedirectResultParams,
  stripSearchQueryText,
} from "@/utils/pageViewTracking";
import { getVisitorId } from "@/utils/visitorId";

const PageViewTracker = () => {
  const location = useLocation();
  const { isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const path = location.pathname || "/";
    // OAuth redirect parameters (code, state, error, error_description) can reach the URL after Amplify rewrites it
    // behind the router's back, so strip them here and never record the callback page itself.
    const queryString = stripSearchQueryText(path, stripRedirectResultParams(location.search || ""));

    if (isAdminPath(path) || isAuthCallbackPath(path) || !shouldTrackPageView(path, queryString)) {
      return;
    }

    // The API only uses attribution on a session's first hit, so it is harmless (and simpler) to
    // send it with every hit rather than tracking "is this the first one" on the client too.
    const attribution = getCapturedAttribution();
    const visitorId = getVisitorId();

    const request: TrackPageViewRequest = {
      path,
      queryString,
      sessionId: getPageViewSessionId(),
      ...(isInternalBrowser() ? { internalBrowser: true } : {}),
      ...(visitorId ? { visitorId } : {}),
      ...(typeof __APP_VERSION__ === "string"
        ? { appVersion: __APP_VERSION__ }
        : {}),
      ...(attribution?.referrer ? { referrer: attribution.referrer } : {}),
      ...(attribution?.utmSource ? { utmSource: attribution.utmSource } : {}),
      ...(attribution?.utmMedium ? { utmMedium: attribution.utmMedium } : {}),
      ...(attribution?.utmCampaign
        ? { utmCampaign: attribution.utmCampaign }
        : {}),
      ...(attribution?.utmContent
        ? { utmContent: attribution.utmContent }
        : {}),
      ...(attribution?.utmTerm ? { utmTerm: attribution.utmTerm } : {}),
      ...(attribution?.gclid ? { gclid: attribution.gclid } : {}),
      ...(attribution?.gbraid ? { gbraid: attribution.gbraid } : {}),
      ...(attribution?.wbraid ? { wbraid: attribution.wbraid } : {}),
      ...(attribution?.msclkid ? { msclkid: attribution.msclkid } : {}),
      ...(attribution?.ttclid ? { ttclid: attribution.ttclid } : {}),
    };

    void analyticsApi.trackPageView(request).catch((error) => {
      console.debug("Page view tracking failed", error);
    });
  }, [isLoading, location.pathname, location.search]);

  return null;
};

export default PageViewTracker;
