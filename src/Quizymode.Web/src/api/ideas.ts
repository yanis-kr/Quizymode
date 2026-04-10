import { apiClient } from "./client";

export type IdeaStatus =
  | "Proposed"
  | "Planned"
  | "In Progress"
  | "Shipped"
  | "Archived";

export type IdeaModerationState =
  | "PendingReview"
  | "Published"
  | "Rejected";

export interface IdeaSummaryResponse {
  id: string;
  title: string;
  problem: string;
  proposedChange: string;
  tradeOffs?: string | null;
  status: IdeaStatus;
  moderationState: IdeaModerationState;
  moderationNotes?: string | null;
  authorName: string;
  reviewedByName?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  reviewedAt?: string | null;
  commentCount: number;
  ratingCount: number;
  averageStars?: number | null;
  myRating?: number | null;
  canEdit: boolean;
  canDelete: boolean;
  canChangeStatus: boolean;
  canModerate: boolean;
}

export interface IdeaBoardResponse {
  ideas: IdeaSummaryResponse[];
}

export interface CreateIdeaRequest {
  title: string;
  problem: string;
  proposedChange: string;
  tradeOffs?: string | null;
  turnstileToken: string;
}

export interface UpdateIdeaRequest {
  title: string;
  problem: string;
  proposedChange: string;
  tradeOffs?: string | null;
}

export interface UpdateIdeaStatusRequest {
  status: IdeaStatus;
}

export interface RejectIdeaRequest {
  moderationNotes: string;
}

export interface IdeaCommentResponse {
  id: string;
  ideaId: string;
  text: string;
  authorName: string;
  createdAt: string;
  updatedAt?: string | null;
  canEdit: boolean;
  canDelete: boolean;
}

export interface IdeaCommentsResponse {
  comments: IdeaCommentResponse[];
}

export interface CreateIdeaCommentRequest {
  text: string;
}

export interface UpdateIdeaCommentRequest {
  text: string;
}

export interface IdeaRatingResponse {
  id: string;
  ideaId: string;
  stars?: number | null;
  createdAt: string;
  updatedAt?: string | null;
}

export interface UpdateIdeaRatingRequest {
  stars: number | null;
}

export const ideasApi = {
  getBoard: async (): Promise<IdeaBoardResponse> => {
    const response = await apiClient.get<IdeaBoardResponse>("/ideas");
    return response.data;
  },

  getMine: async (): Promise<IdeaBoardResponse> => {
    const response = await apiClient.get<IdeaBoardResponse>("/ideas/mine");
    return response.data;
  },

  create: async (data: CreateIdeaRequest): Promise<IdeaSummaryResponse> => {
    const response = await apiClient.post<IdeaSummaryResponse>("/ideas", data);
    return response.data;
  },

  update: async (
    id: string,
    data: UpdateIdeaRequest
  ): Promise<IdeaSummaryResponse> => {
    const response = await apiClient.put<IdeaSummaryResponse>(`/ideas/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/ideas/${id}`);
  },

  updateStatus: async (
    id: string,
    data: UpdateIdeaStatusRequest
  ): Promise<IdeaSummaryResponse> => {
    const response = await apiClient.put<IdeaSummaryResponse>(
      `/ideas/${id}/status`,
      data
    );
    return response.data;
  },

  getComments: async (ideaId: string): Promise<IdeaCommentsResponse> => {
    const response = await apiClient.get<IdeaCommentsResponse>(
      `/ideas/${ideaId}/comments`
    );
    return response.data;
  },

  createComment: async (
    ideaId: string,
    data: CreateIdeaCommentRequest
  ): Promise<IdeaCommentResponse> => {
    const response = await apiClient.post<IdeaCommentResponse>(
      `/ideas/${ideaId}/comments`,
      data
    );
    return response.data;
  },

  updateComment: async (
    ideaId: string,
    commentId: string,
    data: UpdateIdeaCommentRequest
  ): Promise<IdeaCommentResponse> => {
    const response = await apiClient.put<IdeaCommentResponse>(
      `/ideas/${ideaId}/comments/${commentId}`,
      data
    );
    return response.data;
  },

  deleteComment: async (ideaId: string, commentId: string): Promise<void> => {
    await apiClient.delete(`/ideas/${ideaId}/comments/${commentId}`);
  },

  setRating: async (
    ideaId: string,
    data: UpdateIdeaRatingRequest
  ): Promise<IdeaRatingResponse> => {
    const response = await apiClient.post<IdeaRatingResponse>(
      `/ideas/${ideaId}/rating`,
      data
    );
    return response.data;
  },

  getAdminIdeas: async (
    moderationState: IdeaModerationState | "all" = "PendingReview"
  ): Promise<IdeaBoardResponse> => {
    const response = await apiClient.get<IdeaBoardResponse>("/admin/ideas", {
      params: { moderationState },
    });
    return response.data;
  },

  approve: async (id: string): Promise<IdeaSummaryResponse> => {
    const response = await apiClient.post<IdeaSummaryResponse>(
      `/admin/ideas/${id}/approve`
    );
    return response.data;
  },

  reject: async (
    id: string,
    data: RejectIdeaRequest
  ): Promise<IdeaSummaryResponse> => {
    const response = await apiClient.post<IdeaSummaryResponse>(
      `/admin/ideas/${id}/reject`,
      data
    );
    return response.data;
  },
};
