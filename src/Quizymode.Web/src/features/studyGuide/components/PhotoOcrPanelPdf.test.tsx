import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PhotoOcrPanel from "./PhotoOcrPanel";
import { createPhotoRecognizer } from "../photoOcr/photoRecognizer";
import { openPdf } from "../photoOcr/pdfPages";
vi.mock("../photoOcr/photoRecognizer", () => ({
  createPhotoRecognizer: vi.fn(),
}));
vi.mock("../photoOcr/pdfPages", () => ({ openPdf: vi.fn() }));
const pdf = (name = "scan.pdf") =>
  new File(["%PDF-1.4"], name, { type: "application/pdf" });
const choose = (file: File) =>
  fireEvent.change(screen.getByLabelText("Choose files"), {
    target: { files: [file] },
  });
describe("PDF preflight and lifecycle", () => {
  const close = vi.fn(async () => undefined);
  const renderPage = vi.fn<(pageNumber: number) => Promise<HTMLCanvasElement>>(async () =>
    document.createElement("canvas"),
  );
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("Worker", class {});
    vi.stubGlobal("createImageBitmap", vi.fn());
    vi.mocked(createPhotoRecognizer).mockReturnValue({
      recognize: vi.fn(),
      recognizeCanvas: vi.fn(),
      cancel: vi.fn(),
      recognizePage: vi.fn(async (render) => {
        const canvas = await render(new AbortController().signal);
        canvas.width = 0;
        return { text: "Page text", confidence: 90 };
      }),
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("checks configured bytes before loading or opening PDF", async () => {
    render(
      <PhotoOcrPanel
        disabled={false}
        maxFileBytes={1}
        onRecognized={vi.fn()}
      />,
    );
    choose(pdf());
    expect(
      await screen.findByText(/This PDF is 8 bytes; the limit is 1/),
    ).toBeInTheDocument();
    expect(openPdf).not.toHaveBeenCalled();
  });
  it("checks pages before rendering and releases rejected sessions", async () => {
    vi.mocked(openPdf).mockResolvedValue({ pageCount: 21, renderPage, close });
    render(<PhotoOcrPanel disabled={false} onRecognized={vi.fn()} />);
    choose(pdf());
    expect(
      await screen.findByText("This PDF has 21 pages. Choose up to 20 pages."),
    ).toBeInTheDocument();
    expect(renderPage).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });
  it("reads PDF pages in order and releases the session on unmount", async () => {
    vi.mocked(openPdf).mockResolvedValue({ pageCount: 2, renderPage, close });
    const onRecognized = vi.fn();
    const { unmount } = render(
      <PhotoOcrPanel disabled={false} onRecognized={onRecognized} />,
    );
    choose(pdf());
    fireEvent.click(
      await screen.findByRole("button", { name: "Read 2 pages" }),
    );
    await waitFor(() =>
      expect(onRecognized).toHaveBeenCalledWith("Page text\n\nPage text"),
    );
    expect(renderPage.mock.calls.map((args) => args[0])).toEqual([1, 2]);
    unmount();
    expect(close).toHaveBeenCalled();
  });
  it("closes an opening session that resolves after unmount", async () => {
    let finish: (value: Awaited<ReturnType<typeof openPdf>>) => void = () =>
      undefined;
    vi.mocked(openPdf).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { unmount } = render(
      <PhotoOcrPanel disabled={false} onRecognized={vi.fn()} />,
    );
    choose(pdf());
    await waitFor(() => expect(openPdf).toHaveBeenCalledTimes(1));
    unmount();
    finish({ pageCount: 2, renderPage, close });
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });
});
