import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import StudyGuideDocumentsPage from "./StudyGuideDocumentsPage";
import { studyGuideDocumentsApi } from "@/api/studyGuideDocuments";

vi.mock("@/api/studyGuideDocuments", () => ({
  studyGuideDocumentsApi: { list: vi.fn() },
}));

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <StudyGuideDocumentsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("StudyGuideDocumentsPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists documents with progress and a Continue link", async () => {
    vi.mocked(studyGuideDocumentsApi.list).mockResolvedValue({
      documents: [
        {
          id: "d1",
          title: "Biology Unit 3",
          fileType: "pdf",
          sectionCount: 6,
          generatedSectionCount: 2,
          acceptedCount: 15,
          collectionId: "c1",
          createdUtc: "2026-10-01T00:00:00Z",
          lastActivityUtc: "2026-10-10T00:00:00Z",
          expiresUtc: "2026-11-09T00:00:00Z",
        },
      ],
    });

    renderPage();

    expect(await screen.findByText("Biology Unit 3")).toBeInTheDocument();
    expect(screen.getByText(/2 of 6 sections generated · 15 questions saved/)).toBeInTheDocument();
    expect(screen.getByText(/text kept until/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue Biology Unit 3" })).toHaveAttribute(
      "href",
      "/study-guides/documents/d1"
    );
    expect(screen.getByRole("link", { name: "Collection" })).toHaveAttribute("href", "/explore/collections/c1");
  });

  it("shows an empty state that links to the upload page", async () => {
    vi.mocked(studyGuideDocumentsApi.list).mockResolvedValue({ documents: [] });

    renderPage();

    expect(await screen.findByText(/not uploaded any study guides yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upload one" })).toHaveAttribute("href", "/study-guide/upload");
  });
});
