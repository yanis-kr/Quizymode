import { z } from "zod";
import { apiClient } from "./client";

export interface TaxonomyL2 {
  slug: string;
  description: string | null;
  itemCount: number;
}

export interface TaxonomyL1 {
  slug: string;
  description: string | null;
  itemCount: number;
  keywords: TaxonomyL2[];
}

export interface TaxonomyCategory {
  slug: string;
  name: string;
  description: string | null;
  itemCount: number;
  groups: TaxonomyL1[];
  allKeywordSlugs: string[];
}

export interface TaxonomyResponse {
  categories: TaxonomyCategory[];
}

/** The API rejects longer text with 400, so callers and this client both cap it. */
export const MAX_SUGGEST_TEXT_LENGTH = 5000;

export const topicSuggestionSchema = z.object({
  categorySlug: z.string(),
  l1: z.string(),
  l2: z.string(),
  path: z.string(),
  description: z.string(),
  score: z.number(),
  matchedTerms: z.array(z.string()),
  reason: z.enum(["text", "yours", "popular"]),
});

export const topicSuggestResponseSchema = z.object({
  suggestions: z.array(topicSuggestionSchema),
});

export type TopicSuggestion = z.infer<typeof topicSuggestionSchema>;
export type TopicSuggestResponse = z.infer<typeof topicSuggestResponseSchema>;

export interface SuggestTopicsOptions {
  limit?: number;
  signal?: AbortSignal;
}

export const taxonomyApi = {
  getAll: async (): Promise<TaxonomyResponse> => {
    const { data } = await apiClient.get<TaxonomyResponse>("/taxonomy");
    return data;
  },

  /**
   * POST /taxonomy/suggest: up to `limit` full category > L1 > L2 paths for the text (no LLM). Empty text returns the
   * caller's recent and popular paths. The text goes in the body, never the URL, and is capped at 5,000 characters.
   */
  suggest: async (text: string, options: SuggestTopicsOptions = {}): Promise<TopicSuggestResponse> => {
    const { data } = await apiClient.post<unknown>(
      "/taxonomy/suggest",
      { text: text.slice(0, MAX_SUGGEST_TEXT_LENGTH), limit: options.limit },
      { signal: options.signal },
    );
    return topicSuggestResponseSchema.parse(data);
  },
};
