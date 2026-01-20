import { apiClient } from "./client";
import type { UserResponse, UpdateUserNameRequest, CheckUserAvailabilityRequest, CheckUserAvailabilityResponse } from "@/types/api";

export interface UserSettingsResponse {
  settings: Record<string, string>;
}

export interface UpdateUserSettingRequest {
  key: string;
  value: string;
}

export interface UpdateUserSettingResponse {
  key: string;
  value: string;
  updatedAt: string;
}

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
    const response = await apiClient.get<CheckUserAvailabilityResponse>(`/users/availability?${params.toString()}`);
    return response.data;
  },

  getSettings: async (): Promise<UserSettingsResponse> => {
    const response = await apiClient.get<UserSettingsResponse>("/users/settings");
    return response.data;
  },

  updateSetting: async (data: UpdateUserSettingRequest): Promise<UpdateUserSettingResponse> => {
    const response = await apiClient.put<UpdateUserSettingResponse>("/users/settings", data);
    return response.data;
  },
};

