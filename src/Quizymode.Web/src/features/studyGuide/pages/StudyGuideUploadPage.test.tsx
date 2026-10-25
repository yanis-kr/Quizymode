import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AxiosError, AxiosHeaders } from "axios";
import StudyGuideUploadPage from "./StudyGuideUploadPage";
import { taxonomyApi, type TopicSuggestion } from "@/api/taxonomy";
import { studyGuideDocumentsApi, type StudyGuideDocumentsConfig } from "@/api/studyGuideDocuments";
import { studyGuideUploadsApi, type StudyGuideUploadResponse } from "@/api/studyGuideUploads";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

vi.mock("@/features/legal/components/ContentComplianceNotice", () => ({
  default: () => null,
}));

vi.mock("@/api/taxonomy", () => ({
  taxonomyApi: { getAll: vi.fn(), suggest: vi.fn() },
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

const scienceChip: TopicSuggestion = {
  categorySlug: "science",
  l1: "biology",
  l2: "plants",
  path: "science › biology › plants",
  description: "Plant biology",
  score: 0.6,
  matchedTerms: ["photosynthesis"],
  reason: "text",
};

async function fillTopic() {
  await screen.findByRole("option", { name: "science" });
  fireEvent.change(screen.getByLabelText(/^category \*$/i), { target: { value: "science" } });
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
    vi.mocked(taxonomyApi.getAll).mockResolvedValue({
      categories: [
        {
          slug: "science",
          name: "Science",
          description: null,
          itemCount: 0,
          allKeywordSlugs: ["biology", "plants"],
          groups: [
            {
              slug: "biology",
              description: null,
              itemCount: 0,
              keywords: [{ slug: "plants", description: "Plant biology", itemCount: 0 }],
            },
          ],
        },
      ],
    });
    vi.mocked(taxonomyApi.suggest).mockResolvedValue({ suggestions: [] });
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

    // No topic: the page blocks the submit with the topic copy and focuses the topic search (AC 12.14).
    await screen.findByRole("option", { name: "science" });
    fireEvent.click(await screen.findByRole("button", { name: /upload study guide/i }));
    expect(
      await screen.findByText(/choose a topic: pick a suggestion, search, or browse all topics/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /search topics/i })).toHaveFocus();

    await fillTopic();
    fireEvent.click(screen.getByRole("button", { name: /upload study guide/i }));
    expect(await screen.findByText(/choose a file to upload/i)).toBeInTheDocument();
    expect(studyGuideDocumentsApi.create).not.toHaveBeenCalled();
  });

  it("suggests from the title and pasted notes, and one tap fills the whole topic (#323)", async () => {
    // AC 12.12
    vi.mocked(taxonomyApi.suggest).mockResolvedValue({ suggestions: [scienceChip] });
    vi.mocked(studyGuideDocumentsApi.create).mockResolvedValue({
      id: "doc-3",
      isDuplicate: false,
    } as Awaited<ReturnType<typeof studyGuideDocumentsApi.create>>);

    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: /paste text/i }));
    fireEvent.change(screen.getByLabelText(/^title/i), { target: { value: "Plants" } });
    fireEvent.change(screen.getByLabelText(/study guide text/i), {
      target: { value: "Photosynthesis turns light into glucose inside the chloroplasts of plant cells." },
    });

    await waitFor(
      () =>
        expect(
          vi.mocked(taxonomyApi.suggest).mock.calls.some(([text]) => text.includes("Plants\nPhotosynthesis turns light"))
        ).toBe(true),
      { timeout: 3000 }
    );

    fireEvent.click(await screen.findByRole("button", { name: /science.*biology.*plants/i }));
    expect(screen.getByTestId("topic-pill")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /upload study guide/i }));

    await waitFor(() =>
      expect(studyGuideDocumentsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ category: "science", navigationKeyword1: "biology", navigationKeyword2: "plants" })
      )
    );
  });

  it("reads at most the first 20,000 bytes of a .txt file to suggest from (#323)", async () => {
    // AC 12.12
    // jsdom has no Blob.text(); real browsers do, and the page relies on it.
    const original = Blob.prototype.text;
    Blob.prototype.text = function (this: Blob) {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsText(this);
      });
    };
    onTestFinished(() => {
      Blob.prototype.text = original;
    });
    vi.mocked(taxonomyApi.suggest).mockResolvedValue({ suggestions: [scienceChip] });
    renderPage();
    await screen.findByRole("tab", { name: /upload file/i });

    const file = new File(["Mitochondria are the powerhouse of the cell. ".repeat(1000)], "cells.txt", {
      type: "text/plain",
    });
    chooseFile(file);

    await waitFor(
      () =>
        expect(
          vi.mocked(taxonomyApi.suggest).mock.calls.some(([text]) => text.startsWith("Mitochondria are the powerhouse"))
        ).toBe(true),
      { timeout: 3000 }
    );
    const sent = vi.mocked(taxonomyApi.suggest).mock.calls.map(([text]) => text).find((t) => t.length > 0)!;
    expect(sent.length).toBeLessThanOrEqual(5000);
    expect(screen.queryByText(/topic suggestions use your title and file name/i)).not.toBeInTheDocument();
  });

  it("uses the title and file name for PDF files and says so under the chips (#323)", async () => {
    // AC 12.12
    vi.mocked(taxonomyApi.suggest).mockResolvedValue({ suggestions: [{ ...scienceChip, reason: "popular" }] });
    renderPage();
    await screen.findByRole("tab", { name: /upload file/i });
    chooseFile(new File(["%PDF"], "plant-biology_chapter3.pdf", { type: "application/pdf" }));

    expect(await screen.findByText(/topic suggestions use your title and file name for this file type/i)).toBeInTheDocument();
    await waitFor(
      () =>
        expect(vi.mocked(taxonomyApi.suggest).mock.calls.some(([text]) => text === "plant biology chapter3")).toBe(true),
      { timeout: 3000 }
    );
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
