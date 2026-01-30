import { apiClient } from "./client";
import type { KeywordsResponse } from "@/types/api";

export const keywordsApi = {
  getNavigationKeywords: async (
    category: string,
    selectedKeywords?: string[]
  ): Promise<KeywordsResponse> => {
    const params: Record<string, string> = { category };
    if (selectedKeywords && selectedKeywords.length > 0) {
      params.selectedKeywords = selectedKeywords.join(",");
    }
    const response = await apiClient.get<KeywordsResponse>("/keywords", {
      params,
    });
    return response.data;
  },
};
