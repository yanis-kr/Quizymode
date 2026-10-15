import { apiClient } from "./client";

export interface TrackPageViewRequest {
  path: string;
  queryString?: string;
  sessionId: string;
  /** Present only when this browser carries the internal-traffic marker. */
  internalBrowser?: boolean;
}

export const analyticsApi = {
  trackPageView: async (request: TrackPageViewRequest): Promise<void> => {
    await apiClient.post("/analytics/page-views", request);
  },
};
