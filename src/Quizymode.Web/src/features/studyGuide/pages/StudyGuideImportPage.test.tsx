import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import StudyGuideImportPage from "./StudyGuideImportPage";
import { categoriesApi } from "@/api/categories";
import { keywordsApi } from "@/api/keywords";
import { studyGuidesApi, studyGuideImportApi } from "@/api/studyGuides";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: true,
  }),
}));

vi.mock("@/api/categories", () => ({
  categoriesApi: {
    getAll: vi.fn(),
  },
}));

vi.mock("@/api/keywords", () => ({
  keywordsApi: {
    getNavigationKeywords: vi.fn(),
  },
}));

vi.mock("@/api/studyGuides", () => ({
  studyGuidesApi: {
    getCurrent: vi.fn(),
  },
  studyGuideImportApi: {
    createSession: vi.fn(),
    getSession: vi.fn(),
    generateChunks: vi.fn(),
    submitChunkResult: vi.fn(),
    submitDedupResult: vi.fn(),
    finalize: vi.fn(),
  },
}));

function renderPage(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/study-guide/import" element={<StudyGuideImportPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("StudyGuideImportPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(studyGuidesApi.getCurrent).mockResolvedValue({
      id: "guide-1",
      title: "Biology Notes",
      contentText: "Cells and tissues",
      sizeBytes: 32,
      createdUtc: "2026-03-24T00:00:00Z",
      updatedUtc: "2026-03-24T00:00:00Z",
      expiresAtUtc: "2026-04-07T00:00:00Z",
    });

    vi.mocked(categoriesApi.getAll).mockResolvedValue({
      categories: [{ category: "science" }],
    } as Awaited<ReturnType<typeof categoriesApi.getAll>>);

    vi.mocked(keywordsApi.getNavigationKeywords).mockImplementation(
      async (_category, selectedKeywords) => ({
        keywords:
          selectedKeywords && selectedKeywords.length > 0
            ? [{ name: "muscular", itemCount: 0, averageRating: null, navigationRank: 2 }]
            : [{ name: "anatomy", itemCount: 0, averageRating: null, navigationRank: 1 }],
      })
    );

    vi.mocked(studyGuideImportApi.getSession).mockResolvedValue(undefined as never);
  });

  it("hydrates scope and set count from query params", async () => {
    renderPage(
      "/study-guide/import?category=science&keywords=anatomy,muscular,exam-prep&sets=4"
    );

    expect(await screen.findByLabelText(/category/i)).toHaveValue("science");
    expect(await screen.findByLabelText(/primary topic/i)).toHaveValue("anatomy");
    expect(await screen.findByLabelText(/subtopic/i)).toHaveValue("muscular");
    expect(await screen.findByLabelText(/additional keywords/i)).toHaveValue("exam-prep");
    expect(await screen.findByLabelText(/number of prompt sets/i)).toHaveValue(4);
  });
});
