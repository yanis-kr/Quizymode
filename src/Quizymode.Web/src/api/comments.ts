import { apiClient } from "./client";

export interface CommentResponse {
  id: string;
  itemId: string;
  text: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string | null;
}

export interface CommentsResponse {
  comments: CommentResponse[];
}

export interface CreateCommentRequest {
  itemId: string;
  text: string;
}

export interface UpdateCommentRequest {
  text: string;
}

export const commentsApi = {
  getByItemId: async (itemId: string): Promise<CommentsResponse> => {
    const response = await apiClient.get<CommentsResponse>("/comments", {
      params: { itemId },
    });
    return response.data;
  },

  create: async (data: CreateCommentRequest): Promise<CommentResponse> => {
    const response = await apiClient.post<CommentResponse>("/comments", {
      itemId: data.itemId,
      text: data.text,
    });
    return response.data;
  },

  update: async (
    id: string,
    data: UpdateCommentRequest
  ): Promise<CommentResponse> => {
    const response = await apiClient.put<CommentResponse>(`/comments/${id}`, {
      text: data.text,
    });
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/comments/${id}`);
  },
};

