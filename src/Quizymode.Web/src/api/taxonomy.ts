import { apiClient } from "./client";

export interface TaxonomyL2 {
  slug: string;
  description: string | null;
}

export interface TaxonomyL1 {
  slug: string;
  description: string | null;
  keywords: TaxonomyL2[];
}

export interface TaxonomyCategory {
  slug: string;
  description: string;
  groups: TaxonomyL1[];
  allKeywordSlugs: string[];
}

export interface TaxonomyResponse {
  categories: TaxonomyCategory[];
}

export const taxonomyApi = {
  getAll: async (): Promise<TaxonomyResponse> => {
    const { data } = await apiClient.get<TaxonomyResponse>("/taxonomy");
    return data;
  },
};
