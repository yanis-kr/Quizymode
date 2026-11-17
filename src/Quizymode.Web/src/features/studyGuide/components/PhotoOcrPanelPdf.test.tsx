import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PhotoOcrPanel from "./PhotoOcrPanel";
import { createPhotoRecognizer } from "../photoOcr/photoRecognizer";
import { openPdf } from "../photoOcr/pdfPages";

vi.mock("../photoOcr/photoRecognizer", () => ({
  createPhotoRecognizer: vi.fn(),
}));

vi.mock("../photoOcr/pdfPages", async () => {
  const actual = await vi.importActual<typeof import("../photoOcr/pdfPages")>("../photoOcr/pdfPages");
  return { ...actual, openPdf: vi.fn() };
});

function pdf(name = "scan.pdf"): File {
  return new File(["%PDF-1.4"], name, { type: "application/pdf" });
}

function chooseScan(file: File) {
  fireEvent.change(screen.getByLabelText(/choose a scanned pdf/i), { target: { files: [file] } });
}

describe("PhotoOcrPanel scanned PDFs (AC 6.6.49, 6.6.50)", () => {
  let recognizeCanvas: ReturnType<typeof vi.fn>;
  let close: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let renderPage: ReturnType<typeof vi.fn<(pageNumber: number) => Promise<HTMLCanvasElement>>>;

  beforeEach(() => {
    vi.clearAllMocks();
    recognizeCanvas = vi.fn();
    vi.mocked(createPhotoRecognizer).mockReturnValue({
      recognize: vi.fn(),
      recognizeCanvas,
      cancel: vi.fn(),
    } as unknown as ReturnType<typeof createPhotoRecognizer>);
    close = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    renderPage = vi.fn(async () => document.createElement("canvas"));
  });

  it("shows the page count and reads each page in order into the review box", async () => {
    vi.mocked(openPdf).mockResolvedValue({ pageCount: 2, renderPage, close });
    recognizeCanvas.mockResolvedValueOnce("Page one text").mockResolvedValueOnce("Page two text");
    const onRecognized = vi.fn();
    render(<PhotoOcrPanel disabled={false} onRecognized={onRecognized} />);

    chooseScan(pdf());
    fireEvent.click(await screen.findByRole("button", { name: /read 2 pages/i }));

    await waitFor(() => expect(onRecognized).toHaveBeenCalledTimes(2));
    expect(onRecognized.mock.calls).toEqual([["Page one text"], ["Page two text"]]);
    expect(renderPage.mock.calls).toEqual([[1], [2]]);
    expect(close).toHaveBeenCalled();
    expect(await screen.findByText(/read 2 of 2 pages/i)).toBeInTheDocument();
  });

  it("rejects a PDF over 20 pages before rendering any page", async () => {
    vi.mocked(openPdf).mockResolvedValue({ pageCount: 21, renderPage, close });
    const onRecognized = vi.fn();
    render(<PhotoOcrPanel disabled={false} onRecognized={onRecognized} />);

    chooseScan(pdf("long.pdf"));

    expect(await screen.findByText("This PDF has 21 pages. Choose up to 20 pages.")).toBeInTheDocument();
    expect(renderPage).not.toHaveBeenCalled();
    expect(onRecognized).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /read 21 pages/i })).not.toBeInTheDocument();
  });

  it("says when a PDF cannot be opened", async () => {
    vi.mocked(openPdf).mockRejectedValue(new Error("not a pdf"));
    render(<PhotoOcrPanel disabled={false} onRecognized={vi.fn()} />);

    chooseScan(pdf("broken.pdf"));

    expect(await screen.findByText(/broken\.pdf could not be opened/i)).toBeInTheDocument();
  });
});
