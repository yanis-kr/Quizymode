import * as React from "react";
import { createPhotoRecognizer, type PhotoRecognizer } from "../photoOcr/photoRecognizer";
import {
  PHOTO_OCR_ACCEPT,
  PHOTO_OCR_LIMITS,
  photoReadFailureMessage,
  validatePhotoSelection,
} from "../photoOcr/photoOcrLimits";
import { openPdf, PDF_PAGE_LIMIT, type PdfSession } from "../photoOcr/pdfPages";

interface PhotoOcrPanelProps {
  disabled: boolean;
  /** Called once per photo or PDF page with its recognized text, so text reaches the form even if a later one is cancelled. */
  onRecognized: (text: string) => void;
}

interface PendingPdf {
  name: string;
  pageCount: number;
}

/** "Photos or scan" input: reads JPEG and PNG photos and scanned PDFs in the browser and hands the text to the review box. */
export default function PhotoOcrPanel({ disabled, onRecognized }: PhotoOcrPanelProps) {
  const recognizerRef = React.useRef<PhotoRecognizer | null>(null);
  const pdfSessionRef = React.useRef<PdfSession | null>(null);
  const runIdRef = React.useRef(0);
  const [running, setRunning] = React.useState(false);
  const [progress, setProgress] = React.useState<{ done: number; total: number; unit: string } | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [failures, setFailures] = React.useState<string[]>([]);
  const [selectedCount, setSelectedCount] = React.useState<number | null>(null);
  const [pendingPdf, setPendingPdf] = React.useState<PendingPdf | null>(null);

  const getRecognizer = () => {
    if (!recognizerRef.current) recognizerRef.current = createPhotoRecognizer();
    return recognizerRef.current;
  };

  const closePdf = () => {
    const session = pdfSessionRef.current;
    pdfSessionRef.current = null;
    if (session) void session.close().catch(() => undefined);
  };

  // Frees the worker and the PDF when the tab is left or the page closes.
  React.useEffect(() => {
    return () => {
      runIdRef.current += 1;
      recognizerRef.current?.cancel();
      recognizerRef.current = null;
      closePdf();
    };
  }, []);

  const cancelRun = () => {
    runIdRef.current += 1;
    recognizerRef.current?.cancel();
    recognizerRef.current = null;
    closePdf();
    setRunning(false);
    setProgress(null);
    setPendingPdf(null);
    setMessage("Recognition cancelled. Text already read is kept.");
  };

  const handlePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    setFailures([]);
    setMessage(null);
    setSelectedCount(files.length || null);
    const problem = validatePhotoSelection(files);
    if (problem) {
      setMessage(problem);
      return;
    }
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setRunning(true);
    const nextFailures: string[] = [];
    for (let index = 0; index < files.length; index += 1) {
      if (runIdRef.current !== runId) return;
      setProgress({ done: index, total: files.length, unit: "photo" });
      try {
        const text = await getRecognizer().recognize(files[index]);
        if (runIdRef.current !== runId) return;
        if (text) onRecognized(text);
        else nextFailures.push(`${files[index].name}: no text was found in this photo.`);
      } catch {
        if (runIdRef.current !== runId) return;
        nextFailures.push(photoReadFailureMessage(files[index].name));
      }
    }
    if (runIdRef.current !== runId) return;
    setFailures(nextFailures);
    setProgress(null);
    setRunning(false);
    setMessage(`Read ${files.length - nextFailures.length} of ${files.length} photos. Check the text below before you submit.`);
  };

  // Opening the PDF is cheap; the page count is checked before any page is rendered (AC 6.6.50).
  const handlePdfChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    closePdf();
    setPendingPdf(null);
    setFailures([]);
    setMessage(null);
    setSelectedCount(null);
    if (!file) return;
    try {
      const session = await openPdf(file);
      if (session.pageCount > PDF_PAGE_LIMIT) {
        await session.close().catch(() => undefined);
        setMessage(`This PDF has ${session.pageCount} pages. Choose up to ${PDF_PAGE_LIMIT} pages.`);
        return;
      }
      pdfSessionRef.current = session;
      setPendingPdf({ name: file.name, pageCount: session.pageCount });
    } catch {
      setMessage(`${file.name} could not be opened. Check that it is a PDF, or type the text instead.`);
    }
  };

  const readPdf = async () => {
    const session = pdfSessionRef.current;
    if (!session || !pendingPdf) return;
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setPendingPdf(null);
    setRunning(true);
    setMessage(null);
    const nextFailures: string[] = [];
    for (let page = 1; page <= session.pageCount; page += 1) {
      if (runIdRef.current !== runId) return;
      setProgress({ done: page - 1, total: session.pageCount, unit: "page" });
      try {
        const canvas = await session.renderPage(page);
        const text = await getRecognizer().recognizeCanvas(canvas);
        if (runIdRef.current !== runId) return;
        if (text) onRecognized(text);
        else nextFailures.push(`${pendingPdf.name}, page ${page}: no text was found on this page.`);
      } catch {
        if (runIdRef.current !== runId) return;
        nextFailures.push(`${pendingPdf.name}, page ${page} could not be read.`);
      }
    }
    if (runIdRef.current !== runId) return;
    closePdf();
    setFailures(nextFailures);
    setProgress(null);
    setRunning(false);
    setMessage(`Read ${session.pageCount - nextFailures.length} of ${session.pageCount} pages. Check the text below before you submit.`);
  };

  const busy = disabled || running;
  const inputClass = (active: boolean) =>
    `inline-block rounded-md border border-gray-300 bg-surface px-3 py-1.5 text-sm font-medium text-gray-700 ${
      active ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-gray-50"
    } has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500`;

  return (
    <div className="space-y-3" data-testid="photo-ocr-panel">
      <div className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-4 text-center">
        <label htmlFor="study-guide-photos" className={inputClass(busy)}>
          Choose photos
          <input
            id="study-guide-photos"
            type="file"
            multiple
            accept={PHOTO_OCR_ACCEPT}
            className="sr-only"
            aria-describedby="study-guide-photos-hint"
            disabled={busy}
            onChange={handlePhotoChange}
          />
        </label>
        <p id="study-guide-photos-hint" className="mt-2 text-xs text-gray-500">
          JPEG or PNG · up to {PHOTO_OCR_LIMITS.maxImages} photos · up to 10 MB each · English text only. Text is
          read on your device; the photos are not uploaded for recognition.
        </p>
        {selectedCount !== null && !running && (
          <p className="mt-2 text-xs text-gray-600">Selected {selectedCount} photo{selectedCount === 1 ? "" : "s"}.</p>
        )}

        <div className="mt-4 border-t border-gray-200 pt-4">
          <label htmlFor="study-guide-scan-pdf" className={inputClass(busy)}>
            Choose a scanned PDF
            <input
              id="study-guide-scan-pdf"
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              aria-describedby="study-guide-pdf-hint"
              disabled={busy}
              onChange={handlePdfChange}
            />
          </label>
          <p id="study-guide-pdf-hint" className="mt-2 text-xs text-gray-500">
            PDF · up to {PDF_PAGE_LIMIT} pages per run. Use this for scans; a PDF with selectable text works better on
            Upload file.
          </p>
        </div>
      </div>

      {pendingPdf && !running && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-gray-700">
            {pendingPdf.name} has {pendingPdf.pageCount} page{pendingPdf.pageCount === 1 ? "" : "s"}.
          </p>
          <button
            type="button"
            onClick={readPdf}
            disabled={disabled}
            className="inline-flex min-h-11 items-center rounded-md bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
          >
            Read {pendingPdf.pageCount} page{pendingPdf.pageCount === 1 ? "" : "s"}
          </button>
        </div>
      )}

      {running && progress && (
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" className="text-sm text-gray-700">
            Reading {progress.unit} {Math.min(progress.done + 1, progress.total)} of {progress.total}…
          </p>
          <button
            type="button"
            onClick={cancelRun}
            className="inline-flex min-h-11 items-center rounded-md border border-gray-300 bg-surface px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Cancel
          </button>
        </div>
      )}

      {!running && message && (
        <p role="status" className="text-sm text-gray-700">
          {message}
        </p>
      )}

      {failures.length > 0 && (
        <ul role="alert" className="list-disc space-y-1 pl-5 text-sm text-red-700">
          {failures.map((failure) => (
            <li key={failure}>{failure}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
