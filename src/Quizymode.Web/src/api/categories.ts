import { apiClient } from "./client";
import type { CategoriesResponse, SubcategoriesResponse } from "@/types/api";

export const categoriesApi = {
  getAll: async (search?: string): Promise<CategoriesResponse> => {
    const params = search ? { search } : {};
    const response = await apiClient.get<CategoriesResponse>("/categories", {
      params,
    });
    return response.data;
  },
  getSubcategories: async (category: string): Promise<SubcategoriesResponse> => {
    const response = await apiClient.get<SubcategoriesResponse>(
      `/categories/${encodeURIComponent(category)}/subcategories`
    );
    return response.data;
  },
};
