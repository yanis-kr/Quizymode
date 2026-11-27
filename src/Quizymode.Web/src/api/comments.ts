import { apiClient } from "./client";

export interface CommentResponse {
  id: string;
  itemId: string;
  text: string;
  createdBy: string;
  createdByName?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

export interface CommentsResponse {
  comments: CommentResponse[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface CreateCommentRequest {
  itemId: string;
  text: string;
}

export interface UpdateCommentRequest {
  text: string;
}

export const commentsApi = {
  /** One page, newest first. The API accepts a page size of at most 100. */
  getByItemId: async (itemId: string, page = 1, pageSize = 50): Promise<CommentsResponse> => {
    const response = await apiClient.get<CommentsResponse>("/comments", {
      params: { itemId, page, pageSize },
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

