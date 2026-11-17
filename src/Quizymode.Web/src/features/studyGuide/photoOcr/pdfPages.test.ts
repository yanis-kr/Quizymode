import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDocument, GlobalWorkerOptions } = vi.hoisted(() => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: "" },
}));

vi.mock("pdfjs-dist", () => ({
  getDocument,
  GlobalWorkerOptions,
}));

import { openPdf, PDF_WORKER_SRC } from "./pdfPages";

describe("openPdf (AC 6.6.51)", () => {
  beforeEach(() => {
    getDocument.mockReset();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
  });

  it("serves the pdf.js worker from our own /ocr/ path", async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 3 }), destroy });

    const session = await openPdf(new File(["%PDF"], "scan.pdf", { type: "application/pdf" }));

    expect(GlobalWorkerOptions.workerSrc).toBe("/ocr/pdf.worker.min.mjs");
    expect(PDF_WORKER_SRC).toBe("/ocr/pdf.worker.min.mjs");
    expect(session.pageCount).toBe(3);
    await session.close();
    expect(destroy).toHaveBeenCalled();
  });

  it("renders a page to a canvas no larger than 2,000 px on its longest side", async () => {
    const render = vi.fn(() => ({ promise: Promise.resolve() }));
    const page = {
      getViewport: ({ scale }: { scale: number }) => ({ width: 3000 * scale, height: 1500 * scale }),
      render,
      cleanup: vi.fn(),
    };
    getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 1, getPage: vi.fn().mockResolvedValue(page), destroy: vi.fn() }),
    });

    const session = await openPdf(new File(["%PDF"], "scan.pdf", { type: "application/pdf" }));
    const canvas = await session.renderPage(1);

    expect(canvas.width).toBeLessThanOrEqual(2000);
    expect(canvas.height).toBeLessThanOrEqual(2000);
    expect(page.cleanup).toHaveBeenCalled();
  });
});
