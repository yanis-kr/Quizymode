import { apiClient } from "./client";
import type { CategoriesResponse } from "@/types/api";

export const categoriesApi = {
  getAll: async (search?: string): Promise<CategoriesResponse> => {
    const params = search ? { search } : {};
    const response = await apiClient.get<CategoriesResponse>("/categories", {
      params,
    });
    return response.data;
  },
};
