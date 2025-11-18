import { apiClient } from './client';
import type { RequestResponse, CreateRequestRequest } from '@/types/api';

export const requestsApi = {
  create: async (data: CreateRequestRequest): Promise<RequestResponse> => {
    const response = await apiClient.post<RequestResponse>('/requests', data);
    return response.data;
  },
};

