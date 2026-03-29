import { apiClient } from "./client";

export interface StudyGuideResponse {
  id: string;
  title: string;
  contentText: string;
  sizeBytes: number;
  createdUtc: string;
  updatedUtc: string;
  expiresAtUtc: string;
}

export interface UpsertStudyGuideRequest {
  title: string;
  contentText: string;
}

export interface UpsertStudyGuideResponse {
  id: string;
  title: string;
  sizeBytes: number;
  updatedUtc: string;
  expiresAtUtc: string;
}

const DEFAULT_MAX_BYTES = 51_200; // 50 KB
const MAX_STUDY_GUIDE_BYTES = 1_000_000;
const STUDY_GUIDE_MAX_BYTES_KEY = "StudyGuideMaxBytes";

function parseEffectiveMaxBytes(settings: Record<string, string> | undefined): number {
  const rawValue = settings?.[STUDY_GUIDE_MAX_BYTES_KEY];
  if (rawValue == null || rawValue.trim() === "") {
    return DEFAULT_MAX_BYTES;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_MAX_BYTES;
  }

  return Math.max(0, Math.min(MAX_STUDY_GUIDE_BYTES, parsed));
}

export const studyGuidesApi = {
  getCurrent: async (): Promise<StudyGuideResponse | null> => {
    try {
      const response = await apiClient.get<StudyGuideResponse>(
        "/study-guides/current"
      );
      return response.data;
    } catch (err: unknown) {
      if (typeof err === "object" && err !== null && "response" in err) {
        const ax = err as { response?: { status?: number } };
        if (ax.response?.status === 404) return null;
      }
      throw err;
    }
  },

  upsert: async (
    data: UpsertStudyGuideRequest
  ): Promise<UpsertStudyGuideResponse> => {
    const response = await apiClient.put<UpsertStudyGuideResponse>(
      "/study-guides/current",
      data
    );
    return response.data;
  },

  delete: async (): Promise<void> => {
    await apiClient.delete("/study-guides/current");
  },

  getEffectiveMaxBytes: async (): Promise<number> => {
    const response = await apiClient.get<{ settings: Record<string, string> }>("/users/settings");
    return parseEffectiveMaxBytes(response.data.settings);
  },

  defaultMaxBytesPerUser: DEFAULT_MAX_BYTES,
};

// --- Study guide import (sessions, chunks, finalize) ---

export interface CreateImportSessionRequest {
  categoryName: string;
  navigationKeywordPath: string[];
  defaultKeywords?: string[];
  targetSetCount?: number;
}

export interface CreateImportSessionResponse {
  sessionId: string;
  studyGuideId: string;
  studyGuideTitle: string;
  studyGuideSizeBytes: number;
}

export interface ChunkInfo {
  id: string;
  chunkIndex: number;
  title: string;
  sizeBytes: number;
  promptText: string;
}

export interface PromptResultDto {
  chunkIndex: number;
  validationStatus: string;
  parsedItemsJson: string | null;
  validationMessagesJson: string | null;
}

export interface DedupResultDto {
  dedupPromptText: string | null;
  rawDedupResponseText: string | null;
  validationStatus: string | null;
  parsedDedupItemsJson: string | null;
}

export interface ImportSessionResponse {
  id: string;
  studyGuideId: string;
  categoryName: string;
  navigationKeywordPath: string[];
  defaultKeywords: string[] | null;
  targetSetCount: number;
  status: string;
  chunks: ChunkInfo[];
  promptResults: PromptResultDto[];
  dedupResult: DedupResultDto | null;
}

export interface SubmitChunkResultResponse {
  validationStatus: string;
  validationMessages: string[];
  parsedItemsJson: string | null;
}

export interface FinalizeImportResponse {
  createdCount: number;
  duplicateCount: number;
  failedCount: number;
  createdItemIds: string[];
  errors: string[];
}

export const studyGuideImportApi = {
  createSession: async (
    data: CreateImportSessionRequest
  ): Promise<CreateImportSessionResponse> => {
    const res = await apiClient.post<CreateImportSessionResponse>(
      "/study-guides/import/sessions",
      data
    );
    return res.data;
  },

  getSession: async (sessionId: string): Promise<ImportSessionResponse> => {
    const res = await apiClient.get<ImportSessionResponse>(
      `/study-guides/import/sessions/${sessionId}`
    );
    return res.data;
  },

  generateChunks: async (sessionId: string): Promise<{ chunks: ChunkInfo[] }> => {
    const res = await apiClient.post<{ chunks: ChunkInfo[] }>(
      `/study-guides/import/sessions/${sessionId}/generate-chunks`
    );
    return res.data;
  },

  submitChunkResult: async (
    sessionId: string,
    chunkIndex: number,
    rawResponseText: string
  ): Promise<SubmitChunkResultResponse> => {
    const res = await apiClient.post<SubmitChunkResultResponse>(
      `/study-guides/import/sessions/${sessionId}/chunks/${chunkIndex}/result`,
      { rawResponseText }
    );
    return res.data;
  },

  submitDedupResult: async (
    sessionId: string,
    rawDedupResponseText: string
  ): Promise<SubmitChunkResultResponse> => {
    const res = await apiClient.post<SubmitChunkResultResponse>(
      `/study-guides/import/sessions/${sessionId}/dedup-result`,
      { rawDedupResponseText }
    );
    return res.data;
  },

  finalize: async (sessionId: string): Promise<FinalizeImportResponse> => {
    const res = await apiClient.post<FinalizeImportResponse>(
      `/study-guides/import/sessions/${sessionId}/finalize`
    );
    return res.data;
  },
};
