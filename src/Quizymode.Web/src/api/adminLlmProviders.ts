import { apiClient } from "./client";

/** Admin AI provider routing (AC 5.12, epic #203). Types mirror the API contract exactly. */

export type LlmVendor = "DeepSeek" | "OpenAI" | "Gemini";

export const LLM_VENDORS: LlmVendor[] = ["DeepSeek", "OpenAI", "Gemini"];

export type LlmAttemptOutcome =
  | "Success"
  | "ProviderError"
  | "Timeout"
  | "ContentFilter"
  | "LowQuoteYield"
  | "InvalidJson";

export interface LlmVendorSettings {
  vendor: LlmVendor;
  keyConfigured: boolean;
  model: string;
}

export interface LlmRoutes {
  free: LlmVendor[];
  premium: LlmVendor[];
}

export interface LlmProvidersResponse {
  vendors: LlmVendorSettings[];
  routes: LlmRoutes;
  monthlySectionBudget: number;
  monthlySectionsUsed: number;
}

export interface UpdateLlmProvidersRequest {
  vendors: Array<{ vendor: LlmVendor; model: string }>;
  routes: LlmRoutes;
}

export interface LlmAttempt {
  createdUtc: string;
  vendor: LlmVendor | string;
  model: string;
  outcome: LlmAttemptOutcome | string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  durationMs: number;
}

export const adminLlmProvidersApi = {
  get: async (): Promise<LlmProvidersResponse> => {
    const response = await apiClient.get<LlmProvidersResponse>("/admin/llm-providers");
    return response.data;
  },

  update: async (request: UpdateLlmProvidersRequest): Promise<LlmProvidersResponse> => {
    const response = await apiClient.put<LlmProvidersResponse>("/admin/llm-providers", request);
    return response.data;
  },

  getAttempts: async (days = 7): Promise<{ attempts: LlmAttempt[] }> => {
    const response = await apiClient.get<{ attempts: LlmAttempt[] }>("/admin/llm-providers/attempts", {
      params: { days },
    });
    return response.data;
  },
};
