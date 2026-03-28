import { apiClient } from "./client";
import type {
  CreateFeedbackSubmissionRequest,
  FeedbackSubmissionResponse,
} from "@/types/api";

export const feedbackApi = {
  create: async (
    data: CreateFeedbackSubmissionRequest
  ): Promise<FeedbackSubmissionResponse> => {
    const response = await apiClient.post<FeedbackSubmissionResponse>("/feedback", data);
    return response.data;
  },
};
