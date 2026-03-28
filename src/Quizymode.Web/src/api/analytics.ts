import { apiClient } from "./client";

export interface TrackPageViewRequest {
  path: string;
  queryString?: string;
  sessionId: string;
}

export const analyticsApi = {
  trackPageView: async (request: TrackPageViewRequest): Promise<void> => {
    await apiClient.post("/analytics/page-views", request);
  },
};
