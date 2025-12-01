import { apiClient } from "./client";
import type { UserResponse, UpdateUserNameRequest, CheckUserAvailabilityRequest, CheckUserAvailabilityResponse } from "@/types/api";

export const usersApi = {
  getCurrent: async (): Promise<UserResponse> => {
    const response = await apiClient.get<UserResponse>("/users/me");
    return response.data;
  },

  updateName: async (data: UpdateUserNameRequest): Promise<UserResponse> => {
    const response = await apiClient.put<UserResponse>("/users/me", data);
    return response.data;
  },

  checkAvailability: async (data: CheckUserAvailabilityRequest): Promise<CheckUserAvailabilityResponse> => {
    const params = new URLSearchParams();
    if (data.username) params.append("username", data.username);
    if (data.email) params.append("email", data.email);
    const response = await apiClient.get<CheckUserAvailabilityResponse>(`/users/check-availability?${params.toString()}`);
    return response.data;
  },
};

