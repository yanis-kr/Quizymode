import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import { PHOTO_OCR_LIMITS } from "./photoOcrLimits";

/** Served from our own origin (copied from pdfjs-dist), so the PDF worker makes no third-party request (AC 6.6.51). */
export const PDF_WORKER_SRC = "/ocr/pdf.worker.min.mjs";

/** Scanned PDFs are read up to this many pages per run (AC 6.6.50). */
export const PDF_PAGE_LIMIT = 20;

export interface PdfSession {
  pageCount: number;
  /** Renders one page to a canvas whose longest side is at most maxLongSide. */
  renderPage(
    pageNumber: number,
    signal?: AbortSignal,
  ): Promise<HTMLCanvasElement>;
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
  let document: PDFDocumentProxy;
  try {
    document = await task.promise;
  } catch (error) {
    await task.destroy();
    throw error;
  }
  return {
    pageCount: document.numPages,
    async renderPage(
      pageNumber: number,
      signal?: AbortSignal,
    ): Promise<HTMLCanvasElement> {
      const page = await document.getPage(pageNumber);
      let canvas: HTMLCanvasElement | null = null;
      try {
        signal?.throwIfAborted();
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(
          2,
          PHOTO_OCR_LIMITS.maxLongSide / Math.max(base.width, base.height),
        );
        const viewport = page.getViewport({ scale });
        canvas = window.document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas is not available");
        const rendering = page.render({
          canvas,
          canvasContext: context,
          viewport,
        });
        const cancel = () => rendering.cancel();
        signal?.addEventListener("abort", cancel, { once: true });
        try {
          await rendering.promise;
          signal?.throwIfAborted();
        } finally {
          signal?.removeEventListener("abort", cancel);
        }
        return canvas;
      } catch (error) {
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
        throw error;
      } finally {
        page.cleanup();
      }
    },
    async close(): Promise<void> {
      await task.destroy();
    },
  };
}
