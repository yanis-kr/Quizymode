import { apiClient } from "./client";
import type { UserResponse, UpdateUserNameRequest } from "@/types/api";

export const usersApi = {
  getCurrent: async (): Promise<UserResponse> => {
    const response = await apiClient.get<UserResponse>("/users/me");
    return response.data;
  },

  updateName: async (data: UpdateUserNameRequest): Promise<UserResponse> => {
    const response = await apiClient.put<UserResponse>("/users/me", data);
    return response.data;
  },
};

