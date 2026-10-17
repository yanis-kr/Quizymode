import { apiClient } from "./client";

export type StudyGuideUploadStatus = "Pending" | "Completed" | "Failed";

export interface StudyGuideUploadConfig {
  enabled: boolean;
  maxTextBytes: number;
  maxQuestions: number;
}

export interface CreateStudyGuideUploadRequest {
  text: string;
  category: string;
  navigationKeyword1: string;
  navigationKeyword2: string;
  keywords?: string[];
}

export interface CreateStudyGuideUploadResponse {
  id: string;
  status: StudyGuideUploadStatus;
  isDuplicate: boolean;
}

export interface StudyGuideGeneratedQuestion {
  question: string;
  correctAnswer: string;
  incorrectAnswers: string[];
  explanation?: string | null;
}

export interface StudyGuideUploadResponse {
  id: string;
  status: StudyGuideUploadStatus;
  category: string;
  navigationKeyword1: string;
  navigationKeyword2: string;
  keywords: string[];
  questions: StudyGuideGeneratedQuestion[];
  error?: string | null;
  createdUtc: string;
  completedUtc?: string | null;
  acceptedUtc?: string | null;
  createdItemCount?: number | null;
}

export interface AcceptStudyGuideUploadResponse {
  createdCount: number;
  duplicateCount: number;
  failedCount: number;
  createdItemIds: string[];
  errors: string[];
}

export const studyGuideUploadsApi = {
  getConfig: async (): Promise<StudyGuideUploadConfig> => {
    const response = await apiClient.get<StudyGuideUploadConfig>("/study-guide-uploads/config");
    return response.data;
  },

  create: async (
    request: CreateStudyGuideUploadRequest
  ): Promise<CreateStudyGuideUploadResponse> => {
    const response = await apiClient.post<CreateStudyGuideUploadResponse>(
      "/study-guide-uploads",
      request
    );
    return response.data;
  },

  get: async (id: string): Promise<StudyGuideUploadResponse> => {
    const response = await apiClient.get<StudyGuideUploadResponse>(
      `/study-guide-uploads/${encodeURIComponent(id)}`
    );
    return response.data;
  },

  accept: async (
    id: string,
    questionIndexes?: number[]
  ): Promise<AcceptStudyGuideUploadResponse> => {
    const response = await apiClient.post<AcceptStudyGuideUploadResponse>(
      `/study-guide-uploads/${encodeURIComponent(id)}/accept`,
      { questionIndexes: questionIndexes ?? null }
    );
    return response.data;
  },
};
