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
  /** Optional (#685): items answered correctly, so the account can show per-set progress. Quiz runs only. */
  correctItemIds?: string[];
  /** Optional; omitted by old clients and treated as "quiz" by the server. */
  mode?: "quiz" | "learn";
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

export interface StudyActivityDay {
  /** UTC calendar day, yyyy-MM-dd. */
  date: string;
  sessions: number;
  questions: number;
  correct: number;
  /** True when the daily quiz was completed that day. */
  hasDaily: boolean;
}

export interface StudyActivity {
  /** Server current UTC day, yyyy-MM-dd. */
  today: string;
  days: number;
  activity: StudyActivityDay[];
  currentStreak: number;
  longestStreak: number;
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

export interface SetProgressResponse {
  scopes: { scope: string; knownCount: number }[];
}

export const MAX_SET_PROGRESS_SCOPES = 12;

export const studySessionsApi = {
  /** Known-item counts per set key for the signed-in user (#685). At most 12 scopes per call. */
  getSetProgress: async (scopes: string[]): Promise<SetProgressResponse> => {
    const response = await apiClient.get<SetProgressResponse>("/users/me/set-progress", {
      params: { scopes: scopes.join(",") },
    });
    return response.data;
  },

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

  getActivity: async (days = 182): Promise<StudyActivity> => {
    const response = await apiClient.get<StudyActivity>("/study-sessions/activity", { params: { days } });
    return response.data;
  },
};
