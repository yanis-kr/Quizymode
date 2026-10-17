import { apiClient } from "./client";

export interface StudySessionSource {
  kind: "collection" | "category" | "global";
  collectionId?: string | null;
  categorySlug?: string | null;
  navigationKeywords?: string[] | null;
  filterKeywords?: string[] | null;
}

export interface RecordStudySessionRequest {
  runId: string;
  completedAt: string;
  correct: number;
  total: number;
  source: StudySessionSource | null;
  missedItemIds: string[];
}

export interface StudySessionDto extends RecordStudySessionRequest {
  id: string;
  /** "quiz" for a live run, "guest-import" for unverified browser-local history. */
  origin: string;
}

export interface RecordStudySessionResponse {
  session: StudySessionDto;
  created: boolean;
}

export interface StudySessionSummary {
  totalSessions: number;
  totalQuestions: number;
  totalCorrect: number;
  accuracyPercent: number | null;
  last30DaysSessions: number;
  last30DaysAccuracyPercent: number | null;
  importedSessions: number;
}

export interface ImportGuestStudySessionsRequest {
  version: number;
  runs: RecordStudySessionRequest[];
}

export interface ImportGuestStudySessionsResponse {
  imported: number;
  duplicates: number;
  rejectedRunIds: string[];
}

export const studySessionsApi = {
  record: async (request: RecordStudySessionRequest): Promise<RecordStudySessionResponse> => {
    const response = await apiClient.post<RecordStudySessionResponse>("/study-sessions", request);
    return response.data;
  },

  importGuest: async (
    request: ImportGuestStudySessionsRequest,
  ): Promise<ImportGuestStudySessionsResponse> => {
    const response = await apiClient.post<ImportGuestStudySessionsResponse>("/study-sessions/import", request);
    return response.data;
  },

  list: async (limit?: number): Promise<StudySessionDto[]> => {
    const response = await apiClient.get<{ sessions: StudySessionDto[] }>("/study-sessions", {
      params: limit ? { limit } : undefined,
    });
    return response.data.sessions;
  },

  getSummary: async (): Promise<StudySessionSummary> => {
    const response = await apiClient.get<StudySessionSummary>("/study-sessions/summary");
    return response.data;
  },
};
