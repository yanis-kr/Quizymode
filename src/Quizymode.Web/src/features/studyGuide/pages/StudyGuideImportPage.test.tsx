import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import StudyGuideImportPage from "./StudyGuideImportPage";
import { taxonomyApi } from "@/api/taxonomy";
import { studyGuidesApi, studyGuideImportApi } from "@/api/studyGuides";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: true,
  }),
}));

vi.mock("@/api/taxonomy", () => ({
  taxonomyApi: {
    getAll: vi.fn(),
    suggest: vi.fn(),
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

    vi.mocked(taxonomyApi.getAll).mockResolvedValue({
      categories: [
        {
          slug: "science",
          name: "Science",
          description: null,
          itemCount: 0,
          allKeywordSlugs: ["anatomy", "muscular"],
          groups: [
            {
              slug: "anatomy",
              description: null,
              itemCount: 0,
              keywords: [{ slug: "muscular", description: null, itemCount: 0 }],
            },
          ],
        },
      ],
    });
    vi.mocked(taxonomyApi.suggest).mockResolvedValue({ suggestions: [] });

    vi.mocked(studyGuideImportApi.getSession).mockResolvedValue(undefined as never);
  });

  it("hydrates scope and set count from query params", async () => {
    renderPage(
      "/study-guide/import?category=science&keywords=anatomy,muscular,exam-prep&sets=4"
    );

    expect(await screen.findByTestId("topic-pill")).toHaveTextContent("science");
    await waitFor(() => expect(screen.getByLabelText(/^category \*$/i)).toHaveValue("science"));
    expect(await screen.findByLabelText(/primary topic/i)).toHaveValue("anatomy");
    expect(await screen.findByLabelText(/subtopic/i)).toHaveValue("muscular");
    expect(await screen.findByLabelText(/additional keywords/i)).toHaveValue("exam-prep");
    expect(await screen.findByLabelText(/number of prompt sets/i)).toHaveValue(4);
  });

  it("shows the picker without chips and never asks for suggestions (#323)", async () => {
    // AC 12.11
    renderPage("/study-guide/import");

    expect(await screen.findByRole("combobox", { name: /search topics/i })).toBeInTheDocument();
    expect(screen.queryByTestId("topic-chip")).not.toBeInTheDocument();
    // No first-category preselection: the topic starts empty.
    expect(await screen.findByLabelText(/^category \*$/i)).toHaveValue("");
    expect(taxonomyApi.suggest).not.toHaveBeenCalled();
  });
});
