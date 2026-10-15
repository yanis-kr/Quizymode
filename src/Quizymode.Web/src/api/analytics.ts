import { apiClient } from "./client";

export interface TrackPageViewRequest {
  path: string;
  queryString?: string;
  sessionId: string;
  /** Present only when this browser carries the internal-traffic marker. */
  internalBrowser?: boolean;
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
}

export interface TrackAnalyticsEventsRequest {
  sessionId: string;
  events: AnalyticsEventPayload[];
  /** Present only when this browser carries the internal-traffic marker. */
  internalBrowser?: boolean;
}

export const analyticsApi = {
  trackPageView: async (request: TrackPageViewRequest): Promise<void> => {
    await apiClient.post("/analytics/page-views", request);
  },

  trackEvents: async (request: TrackAnalyticsEventsRequest): Promise<void> => {
    await apiClient.post("/analytics/events", request);
  },
};
