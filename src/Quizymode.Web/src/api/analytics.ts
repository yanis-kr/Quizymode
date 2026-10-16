import { apiClient } from "./client";

export interface TrackPageViewRequest {
  path: string;
  queryString?: string;
  sessionId: string;
  /** Present only when this browser carries the internal-traffic marker. */
  internalBrowser?: boolean;
  /** Visitor id from localStorage; omitted when GPC is on or storage is unavailable. */
  visitorId?: string;
  /** Raw referrer URL, sent only on a session's first hit. */
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  msclkid?: string;
  ttclid?: string;
  /** Build version of the SPA, stored on the session's first-hit snapshot. */
  appVersion?: string;
}

/** One allowlisted engagement event; see AnalyticsEventCatalog on the API. */
export interface AnalyticsEventPayload {
  name: string;
  path: string;
  contextType?: string;
  contextId?: string;
  clientEventId?: string;
  runId?: string;
  score?: number;
  total?: number;
  itemId?: string;
  position?: number;
  isCorrect?: boolean;
}

export interface TrackAnalyticsEventsRequest {
  sessionId: string;
  events: AnalyticsEventPayload[];
  /** Present only when this browser carries the internal-traffic marker. */
  internalBrowser?: boolean;
  /** Visitor id from localStorage; fills a missing visitor id on the session's attribution row. */
  visitorId?: string;
}

export const analyticsApi = {
  trackPageView: async (request: TrackPageViewRequest): Promise<void> => {
    await apiClient.post("/analytics/page-views", request);
  },

  trackEvents: async (request: TrackAnalyticsEventsRequest): Promise<void> => {
    await apiClient.post("/analytics/events", request);
  },
};
