import { apiClient } from "./client";
import type { KeywordsResponse } from "@/types/api";

export interface KeywordDescriptionItem {
  name: string;
  description: string | null;
}

export interface KeywordDescriptionsResponse {
  keywords: KeywordDescriptionItem[];
}

/** Distinct item-level tag names in a category (for create/edit autocomplete). */
export interface ItemTagKeywordsResponse {
  names: string[];
}

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

  /** Sorted distinct names from ItemKeywords in the category; cache per category on the client. */
  getItemTagKeywords: async (category: string): Promise<ItemTagKeywordsResponse> => {
    const response = await apiClient.get<ItemTagKeywordsResponse>(
      "/keywords/item-tags",
      { params: { category } }
    );
    return response.data;
  },

  getKeywordDescriptions: async (
    category: string,
    keywords: string[]
  ): Promise<KeywordDescriptionsResponse> => {
    const params: Record<string, string> = { category };
    if (keywords.length > 0) {
      params.keywords = keywords.join(",");
    }
    const response = await apiClient.get<KeywordDescriptionsResponse>(
      "/keywords/descriptions",
      { params }
    );
    return response.data;
  },
};
