import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AxiosError, AxiosHeaders } from "axios";
import StudyGuideUploadPage from "./StudyGuideUploadPage";
import { categoriesApi } from "@/api/categories";
import { keywordsApi } from "@/api/keywords";
import { studyGuideDocumentsApi, type StudyGuideDocumentsConfig } from "@/api/studyGuideDocuments";
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

vi.mock("@/api/studyGuideDocuments", () => ({
  studyGuideDocumentsApi: {
    getConfig: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("@/api/studyGuideUploads", () => ({
  studyGuideUploadsApi: {
    get: vi.fn(),
    accept: vi.fn(),
  },
}));

function DocumentRouteProbe() {
  const location = useLocation();
  return (
    <div data-testid="document-route">
      {location.pathname}|{JSON.stringify(location.state)}
    </div>
  );
}

function renderPage(initialEntry = "/create/notes") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/create/notes" element={<StudyGuideUploadPage />} />
          <Route path="/study-guides/documents/:id" element={<DocumentRouteProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const config: StudyGuideDocumentsConfig = {
  enabled: true,
  maxFileBytes: 20 * 1024 * 1024,
  maxPages: 300,
  maxTextBytes: 1000,
  acceptedExtensions: [".pdf", ".docx", ".pptx", ".txt", ".md"],
  freeTierDelayMinutes: 10,
  quota: { tier: "Free", dailyLimit: 10, dailyUsed: 0, monthlyLimit: 60, monthlyUsed: 0, remainingToday: 10 },
};

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

async function fillTopic() {
  await screen.findByRole("option", { name: "science" });
  fireEvent.change(screen.getByLabelText(/category/i), { target: { value: "science" } });
  await screen.findByRole("option", { name: "biology" });
  fireEvent.change(screen.getByLabelText(/primary topic/i), { target: { value: "biology" } });
  await screen.findByRole("option", { name: "plants" });
  fireEvent.change(screen.getByLabelText(/subtopic/i), { target: { value: "plants" } });
}

function chooseFile(file: File) {
  fireEvent.change(screen.getByLabelText(/choose study guide file/i), { target: { files: [file] } });
}

function sizedFile(name: string, bytes: number, type = "application/pdf"): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: bytes });
  return file;
}

describe("StudyGuideUploadPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(studyGuideDocumentsApi.getConfig).mockResolvedValue(config);
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
    vi.mocked(studyGuideDocumentsApi.getConfig).mockResolvedValue({ ...config, enabled: false });

    renderPage();

    expect(await screen.findByText(/feature unavailable/i)).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /upload file/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /your earlier study guides/i })).toHaveAttribute(
      "href",
      "/study-guides/documents"
    );
  });

  it("offers Upload file and Paste text tabs with the accepted file types", async () => {
    renderPage();

    const fileTab = await screen.findByRole("tab", { name: /upload file/i });
    expect(fileTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText(/choose study guide file/i)).toHaveAttribute(
      "accept",
      ".pdf,.docx,.pptx,.txt,.md"
    );

    fireEvent.click(screen.getByRole("tab", { name: /paste text/i }));
    expect(screen.getByRole("tab", { name: /paste text/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText(/study guide text/i)).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("tab", { name: /paste text/i }), { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: /upload file/i })).toHaveAttribute("aria-selected", "true");
  });

  it("requires a file and a full topic before uploading", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /upload study guide/i }));
    expect(await screen.findByText(/choose a file to upload/i)).toBeInTheDocument();

    chooseFile(new File(["notes"], "notes.pdf", { type: "application/pdf" }));
    fireEvent.click(screen.getByRole("button", { name: /upload study guide/i }));
    expect(await screen.findByText(/choose a category/i)).toBeInTheDocument();
    expect(studyGuideDocumentsApi.create).not.toHaveBeenCalled();
  });

  it("rejects unsupported and oversized files on the client", async () => {
    renderPage();
    await fillTopic();

    chooseFile(new File(["x"], "photo.png", { type: "image/png" }));
    fireEvent.click(screen.getByRole("button", { name: /upload study guide/i }));
    expect(await screen.findByText(/unsupported file type/i)).toBeInTheDocument();

    chooseFile(sizedFile("huge.pdf", 21 * 1024 * 1024));
    expect(screen.getByTestId("study-guide-selected-file")).toHaveTextContent(/too large/i);
    expect(screen.getByRole("button", { name: /upload study guide/i })).toBeDisabled();
    expect(studyGuideDocumentsApi.create).not.toHaveBeenCalled();
  });

  it("shows a byte counter for pasted text and blocks text over the limit", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("tab", { name: /paste text/i }));
    const textarea = screen.getByLabelText(/study guide text/i);
    fireEvent.change(textarea, { target: { value: "héllo" } });
    expect(screen.getByText(/6 \/ 1,000 bytes/)).toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: "a".repeat(1001) } });
    expect(screen.getByText(/too long/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upload study guide/i })).toBeDisabled();
  });

  it("uploads a file with topic, title and keywords, then opens the document page", async () => {
    vi.mocked(studyGuideDocumentsApi.create).mockResolvedValue({
      id: "doc-1",
      isDuplicate: true,
    } as Awaited<ReturnType<typeof studyGuideDocumentsApi.create>>);
    const file = new File(["%PDF-1.7"], "chapter-3.pdf", { type: "application/pdf" });

    renderPage();
    await fillTopic();
    chooseFile(file);
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "  Chapter 3  " } });
    fireEvent.change(screen.getByLabelText(/keywords/i), { target: { value: "exam prep, unit-2" } });
    fireEvent.click(screen.getByRole("button", { name: /upload study guide/i }));

    await waitFor(() =>
      expect(studyGuideDocumentsApi.create).toHaveBeenCalledWith({
        file,
        text: null,
        title: "Chapter 3",
        category: "science",
        navigationKeyword1: "biology",
        navigationKeyword2: "plants",
        keywords: ["exam-prep", "unit-2"],
      })
    );
    expect(await screen.findByTestId("document-route")).toHaveTextContent(
      '/study-guides/documents/doc-1|{"isDuplicate":true}'
    );
  });

  it("posts pasted text to the documents endpoint", async () => {
    vi.mocked(studyGuideDocumentsApi.create).mockResolvedValue({
      id: "doc-2",
      isDuplicate: false,
    } as Awaited<ReturnType<typeof studyGuideDocumentsApi.create>>);

    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: /paste text/i }));
    fireEvent.change(screen.getByLabelText(/study guide text/i), { target: { value: "Photosynthesis notes" } });
    await fillTopic();
    fireEvent.click(screen.getByRole("button", { name: /upload study guide/i }));

    await waitFor(() =>
      expect(studyGuideDocumentsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ file: null, text: "Photosynthesis notes", title: null })
      )
    );
  });

  it("shows the API reason when the server rejects the file", async () => {
    vi.mocked(studyGuideDocumentsApi.create).mockRejectedValue(
      new AxiosError("Bad Request", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 400,
        statusText: "Bad Request",
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: {
          title: "StudyGuideDocument.Scanned",
          detail: "This looks like a scan; only PDFs with selectable text are supported for now.",
        },
      })
    );

    renderPage();
    await fillTopic();
    chooseFile(new File(["%PDF"], "scan.pdf", { type: "application/pdf" }));
    fireEvent.click(screen.getByRole("button", { name: /upload study guide/i }));

    expect(await screen.findByText(/looks like a scan/i)).toBeInTheDocument();
  });

  it("keeps earlier one-shot upload links working (?id=)", async () => {
    vi.mocked(studyGuideUploadsApi.get).mockResolvedValue(completedUpload);
    vi.mocked(studyGuideUploadsApi.accept).mockResolvedValue({
      createdCount: 1,
      duplicateCount: 0,
      failedCount: 0,
      createdItemIds: ["i1"],
      errors: [],
    });

    renderPage("/create/notes?id=u1");

    fireEvent.click(await screen.findByLabelText(/include question 2/i));
    fireEvent.click(screen.getByRole("button", { name: /add 1 selected to my items/i }));

    await waitFor(() => expect(studyGuideUploadsApi.accept).toHaveBeenCalledWith("u1", [0]));
    expect(await screen.findByText(/added 1 item to your private items/i)).toBeInTheDocument();
    expect(studyGuideDocumentsApi.getConfig).not.toHaveBeenCalled();
  });

  it("shows the failure reason for a failed one-shot upload", async () => {
    vi.mocked(studyGuideUploadsApi.get).mockResolvedValue({
      ...completedUpload,
      status: "Failed",
      questions: [],
      error: "The question generator is temporarily unavailable. Please try again later.",
    });

    renderPage("/create/notes?id=u1");

    expect(await screen.findByText(/temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
