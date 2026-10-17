import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import StudyGuideUploadPage from "./StudyGuideUploadPage";
import { categoriesApi } from "@/api/categories";
import { keywordsApi } from "@/api/keywords";
import { studyGuideUploadsApi, type StudyGuideUploadResponse } from "@/api/studyGuideUploads";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

vi.mock("@/features/legal/components/ContentComplianceNotice", () => ({
  default: () => null,
}));

vi.mock("@/api/categories", () => ({
  categoriesApi: { getAll: vi.fn() },
}));

vi.mock("@/api/keywords", () => ({
  keywordsApi: { getNavigationKeywords: vi.fn() },
}));

vi.mock("@/api/studyGuideUploads", () => ({
  studyGuideUploadsApi: {
    getConfig: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    accept: vi.fn(),
  },
}));

function renderPage(initialEntry = "/study-guide/upload") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/study-guide/upload" element={<StudyGuideUploadPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const completedUpload: StudyGuideUploadResponse = {
  id: "u1",
  status: "Completed",
  category: "science",
  navigationKeyword1: "biology",
  navigationKeyword2: "plants",
  keywords: [],
  questions: [
    { question: "What do plants make?", correctAnswer: "Glucose", incorrectAnswers: ["Salt", "Iron", "Sand"], explanation: "From light." },
    { question: "Where does it happen?", correctAnswer: "Chloroplasts", incorrectAnswers: ["Roots", "Bark", "Seeds"] },
  ],
  createdUtc: "2026-10-17T00:00:00Z",
  completedUtc: "2026-10-17T00:00:10Z",
  acceptedUtc: null,
  createdItemCount: null,
};

async function fillForm(text: string) {
  fireEvent.change(await screen.findByLabelText(/study guide text/i), { target: { value: text } });
  fireEvent.change(await screen.findByLabelText(/category/i), { target: { value: "science" } });
  await screen.findByRole("option", { name: "biology" });
  fireEvent.change(screen.getByLabelText(/primary topic/i), { target: { value: "biology" } });
  await screen.findByRole("option", { name: "plants" });
  fireEvent.change(screen.getByLabelText(/subtopic/i), { target: { value: "plants" } });
}

describe("StudyGuideUploadPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(studyGuideUploadsApi.getConfig).mockResolvedValue({ enabled: true, maxTextBytes: 10240, maxQuestions: 20 });
    vi.mocked(categoriesApi.getAll).mockResolvedValue({
      categories: [{ category: "science" }],
    } as Awaited<ReturnType<typeof categoriesApi.getAll>>);
    vi.mocked(keywordsApi.getNavigationKeywords).mockImplementation(async (_category, selected) => ({
      keywords:
        selected && selected.length > 0
          ? [{ name: "plants", itemCount: 0, averageRating: null, navigationRank: 2 }]
          : [{ name: "biology", itemCount: 0, averageRating: null, navigationRank: 1 }],
    }));
  });

  it("shows an unavailable message when AI generation is disabled", async () => {
    vi.mocked(studyGuideUploadsApi.getConfig).mockResolvedValue({ enabled: false, maxTextBytes: 10240, maxQuestions: 20 });

    renderPage();

    expect(await screen.findByText(/feature unavailable/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/study guide text/i)).not.toBeInTheDocument();
  });

  it("shows a live byte counter and blocks text over 10 KB", async () => {
    renderPage();

    const textarea = await screen.findByLabelText(/study guide text/i);
    fireEvent.change(textarea, { target: { value: "héllo" } });
    expect(screen.getByText(/6 \/ 10,240 bytes/)).toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: "a".repeat(10241) } });
    expect(screen.getByText(/too long/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate questions/i })).toBeDisabled();
  });

  it("validates required fields before submitting", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /generate questions/i }));

    expect(await screen.findByText(/paste your study guide text/i)).toBeInTheDocument();
    expect(studyGuideUploadsApi.create).not.toHaveBeenCalled();
  });

  it("submits, polls while pending, and shows the generated questions", async () => {
    vi.mocked(studyGuideUploadsApi.create).mockResolvedValue({ id: "u1", status: "Pending", isDuplicate: false });
    vi.mocked(studyGuideUploadsApi.get)
      .mockResolvedValueOnce({ ...completedUpload, status: "Pending", questions: [] })
      .mockResolvedValue(completedUpload);

    renderPage();
    await fillForm("Photosynthesis makes glucose in chloroplasts.");
    fireEvent.change(screen.getByLabelText(/keywords/i), { target: { value: "exam prep" } });
    fireEvent.click(screen.getByRole("button", { name: /generate questions/i }));

    await waitFor(() =>
      expect(studyGuideUploadsApi.create).toHaveBeenCalledWith({
        text: "Photosynthesis makes glucose in chloroplasts.",
        category: "science",
        navigationKeyword1: "biology",
        navigationKeyword2: "plants",
        keywords: ["exam-prep"],
      })
    );
    expect(await screen.findByText(/generating questions/i)).toBeInTheDocument();
    expect(await screen.findByText(/what do plants make/i, {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText(/2 generated questions/i)).toBeInTheDocument();
  });

  it("shows the duplicate message when the same text was already uploaded", async () => {
    vi.mocked(studyGuideUploadsApi.create).mockResolvedValue({ id: "u1", status: "Completed", isDuplicate: true });
    vi.mocked(studyGuideUploadsApi.get).mockResolvedValue(completedUpload);

    renderPage();
    await fillForm("Same notes as before.");
    fireEvent.click(screen.getByRole("button", { name: /generate questions/i }));

    expect(await screen.findByText(/already uploaded this study guide/i)).toBeInTheDocument();
    expect(await screen.findByText(/what do plants make/i)).toBeInTheDocument();
  });

  it("adds only the selected questions as items", async () => {
    vi.mocked(studyGuideUploadsApi.get).mockResolvedValue(completedUpload);
    vi.mocked(studyGuideUploadsApi.accept).mockResolvedValue({
      createdCount: 1,
      duplicateCount: 0,
      failedCount: 0,
      createdItemIds: ["i1"],
      errors: [],
    });

    renderPage("/study-guide/upload?id=u1");

    fireEvent.click(await screen.findByLabelText(/include question 2/i));
    fireEvent.click(screen.getByRole("button", { name: /add 1 selected to my items/i }));

    await waitFor(() => expect(studyGuideUploadsApi.accept).toHaveBeenCalledWith("u1", [0]));
    expect(await screen.findByText(/added 1 item to your private items/i)).toBeInTheDocument();
  });

  it("shows the failure reason for a failed upload", async () => {
    vi.mocked(studyGuideUploadsApi.get).mockResolvedValue({
      ...completedUpload,
      status: "Failed",
      questions: [],
      error: "The question generator is temporarily unavailable. Please try again later.",
    });

    renderPage("/study-guide/upload?id=u1");

    expect(await screen.findByText(/temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
