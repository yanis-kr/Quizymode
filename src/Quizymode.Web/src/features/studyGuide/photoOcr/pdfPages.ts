import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from "pdfjs-dist";
import { PHOTO_OCR_LIMITS } from "./photoOcrLimits";

/** Served from our own origin (copied from pdfjs-dist), so the PDF worker makes no third-party request (AC 6.6.51). */
export const PDF_WORKER_SRC = "/ocr/pdf.worker.min.mjs";

/** Scanned PDFs are read up to this many pages per run (AC 6.6.50). */
export const PDF_PAGE_LIMIT = 20;

export interface PdfSession {
  pageCount: number;
  /** Renders one page to a canvas whose longest side is at most maxLongSide. */
  renderPage(pageNumber: number): Promise<HTMLCanvasElement>;
  close(): Promise<void>;
}

let workerConfigured = false;

/** Opens a PDF in the browser. The caller checks pageCount and closes the session when it does not proceed. */
export async function openPdf(file: File): Promise<PdfSession> {
  if (!workerConfigured) {
    GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
    workerConfigured = true;
  }
  const data = new Uint8Array(await file.arrayBuffer());
  const task = getDocument({ data });
  const document: PDFDocumentProxy = await task.promise;
  return {
    pageCount: document.numPages,
    async renderPage(pageNumber: number): Promise<HTMLCanvasElement> {
      const page = await document.getPage(pageNumber);
      try {
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(2, PHOTO_OCR_LIMITS.maxLongSide / Math.max(base.width, base.height));
        const viewport = page.getViewport({ scale });
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas is not available");
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        return canvas;
      } finally {
        page.cleanup();
      }
    },
    async close(): Promise<void> {
      await task.destroy();
    },
  };
}
