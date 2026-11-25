import * as React from "react";
import {
  createPhotoRecognizer,
  type PhotoRecognizer,
} from "../photoOcr/photoRecognizer";
import {
  isPdf,
  OCR_FILE_ACCEPT,
  PHOTO_OCR_ACCEPT,
  PDF_PAGE_LIMIT,
  validateOcrSelection,
} from "../photoOcr/photoOcrLimits";
import type { PdfSession } from "../photoOcr/pdfPages";

interface PhotoOcrPanelProps {
  disabled: boolean;
  maxFileBytes?: number;
  text?: string;
  hasEditedText?: boolean;
  onRecognized: (text: string) => void;
  onBlockedChange?: (blocked: boolean) => void;
  onReviewReady?: () => void;
  onConfidenceChange?: (lowConfidence: boolean) => void;
}
type PageState = "Queued" | "Reading" | "Done" | "No text found" | "Failed";
interface OcrPage {
  name: string;
  file?: File;
  state: PageState;
  text: string;
  confidence: number;
  omitted: boolean;
  error?: string;
}
const controlClass =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50";

export default function PhotoOcrPanel({
  disabled,
  maxFileBytes = 20 * 1024 * 1024,
  text = "",
  hasEditedText = false,
  onRecognized,
  onBlockedChange,
  onReviewReady,
  onConfidenceChange,
}: PhotoOcrPanelProps) {
  const supported =
    typeof Worker !== "undefined" &&
    typeof WebAssembly !== "undefined" &&
    typeof createImageBitmap === "function";
  const recognizer = React.useRef<PhotoRecognizer | null>(null);
  const pdf = React.useRef<PdfSession | null>(null);
  const pagesRef = React.useRef<OcrPage[]>([]);
  const operation = React.useRef(0);
  const locked = React.useRef(false);
  const cancelRequested = React.useRef(false);
  const callbacks = React.useRef({
    onRecognized,
    onBlockedChange,
    onReviewReady,
    onConfidenceChange,
    text,
    hasEditedText,
  });
  callbacks.current = {
    onRecognized,
    onBlockedChange,
    onReviewReady,
    onConfidenceChange,
    text,
    hasEditedText,
  };
  const lastPublished = React.useRef("");
  const [pages, setPages] = React.useState<OcrPage[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [opening, setOpening] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [messageIsError, setMessageIsError] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const [replacement, setReplacement] = React.useState<string | null>(null);

  const closePdf = () => {
    const session = pdf.current;
    pdf.current = null;
    if (session) void session.close().catch(() => undefined);
  };
  React.useEffect(
    () => () => {
      operation.current += 1;
      recognizer.current?.cancel();
      closePdf();
      callbacks.current.onBlockedChange?.(false);
      callbacks.current.onConfidenceChange?.(false);
    },
    [],
  );

  const updatePages = (next: OcrPage[]) => {
    pagesRef.current = next;
    setPages(next);
    callbacks.current.onConfidenceChange?.(
      next.some(
        (page) =>
          page.state === "Done" && !page.omitted && page.confidence < 60,
      ),
    );
  };
  const publishReview = (next: OcrPage[], focus: boolean) => {
    const joined = next
      .filter((page) => !page.omitted && page.state === "Done")
      .map((page) => page.text)
      .join("\n\n");
    if (joined === lastPublished.current) {
      if (focus) callbacks.current.onReviewReady?.();
      return;
    }
    if (callbacks.current.hasEditedText) {
      if (joined !== lastPublished.current) setReplacement(joined);
    } else {
      lastPublished.current = joined;
      callbacks.current.onRecognized(joined);
      setReplacement(null);
      if (focus) callbacks.current.onReviewReady?.();
    }
  };
  const finish = (next: OcrPage[]) => {
    locked.current = false;
    setBusy(false);
    setCancelling(false);
    const unresolved = next.some(
      (page) => !page.omitted && page.state !== "Done",
    );
    callbacks.current.onBlockedChange?.(unresolved);
    publishReview(next, !unresolved);
  };
  const run = async (indices: number[]) => {
    if (locked.current || disabled || !supported) return;
    locked.current = true;
    callbacks.current.onBlockedChange?.(true);
    setBusy(true);
    cancelRequested.current = false;
    setMessage("");
    setMessageIsError(false);
    setAnnouncement("");
    const runId = ++operation.current;
    for (const index of indices) {
      if (operation.current !== runId || cancelRequested.current) break;
      let next = pagesRef.current.map((page, position) =>
        position === index
          ? {
              ...page,
              state: "Reading" as const,
              error: undefined,
              omitted: false,
            }
          : page,
      );
      updatePages(next);
      const page = next[index];
      try {
        recognizer.current ??= createPhotoRecognizer();
        const result = page.file
          ? await recognizer.current.recognize(page.file)
          : await recognizer.current.recognizePage((signal) =>
              pdf.current!.renderPage(index + 1, signal),
            );
        if (operation.current !== runId) return;
        next = pagesRef.current.map((entry, position) =>
          position === index
            ? {
                ...entry,
                text: result.text,
                confidence: result.confidence,
                state: result.text
                  ? ("Done" as const)
                  : ("No text found" as const),
              }
            : entry,
        );
      } catch (failure) {
        if (operation.current !== runId) return;
        const heic =
          page.file &&
          (/\.(heic|heif)$/i.test(page.file.name) ||
            /image\/hei[cf]/i.test(page.file.type)) &&
          failure instanceof Error &&
          failure.name === "PhotoDecodeError";
        const error = heic
          ? "This browser can't open this HEIC photo. Choose a JPEG or PNG, or set the iPhone camera to Most Compatible."
          : `Couldn't read page ${index + 1}.`;
        next = pagesRef.current.map((entry, position) =>
          position === index
            ? { ...entry, state: "Failed" as const, text: "", error }
            : entry,
        );
      }
      updatePages(next);
      publishReview(next, false);
      setAnnouncement(`Page ${index + 1} ${next[index].state.toLowerCase()}.`);
    }
    if (operation.current !== runId) return;
    if (cancelRequested.current) {
      recognizer.current?.cancel();
      recognizer.current = null;
      setMessage(
        "Recognition cancelled. Selection and text already read are kept.",
      );
    } else {
      setMessage("Check the text below before you submit.");
    }
    finish(pagesRef.current);
  };

  const choose = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length || locked.current || disabled || !supported) return;
    const problem = validateOcrSelection(files, maxFileBytes);
    if (problem) {
      setMessage(problem);
      setMessageIsError(true);
      return;
    }
    setMessage("");
    setMessageIsError(false);
    setReplacement(null);
    if (!isPdf(files[0])) {
      closePdf();
      updatePages(
        files.map((file) => ({
          name: file.name,
          file,
          state: "Queued",
          text: "",
          confidence: 100,
          omitted: false,
        })),
      );
      void run(files.map((_file, index) => index));
      return;
    }
    locked.current = true;
    callbacks.current.onBlockedChange?.(true);
    setOpening(true);
    const runId = ++operation.current;
    try {
      const { openPdf } = await import("../photoOcr/pdfPages");
      if (operation.current !== runId) return;
      const session = await openPdf(files[0]);
      if (operation.current !== runId) {
        await session.close();
        return;
      }
      if (session.pageCount > PDF_PAGE_LIMIT) {
        await session.close();
        setMessage(
          `This PDF has ${session.pageCount} pages. Choose up to ${PDF_PAGE_LIMIT} pages.`,
        );
        setMessageIsError(true);
      } else {
        closePdf();
        pdf.current = session;
        updatePages(
          Array.from({ length: session.pageCount }, (_value, index) => ({
            name: `${files[0].name}, page ${index + 1}`,
            state: "Queued",
            text: "",
            confidence: 100,
            omitted: false,
          })),
        );
      }
    } catch {
      if (operation.current === runId) {
        setMessage(
          `${files[0].name} could not be opened. Check that it is a PDF, or type the text instead.`,
        );
        setMessageIsError(true);
      }
    } finally {
      if (operation.current === runId) {
        locked.current = false;
        setOpening(false);
        callbacks.current.onBlockedChange?.(
          pagesRef.current.some(
            (page) => !page.omitted && page.state !== "Done",
          ),
        );
      }
    }
  };
  const omit = (index: number) => {
    const next = pagesRef.current.map((page, position) =>
      position === index ? { ...page, omitted: true } : page,
    );
    updatePages(next);
    finish(next);
  };
  const currentIndex = pages.findIndex((page) => page.state === "Reading");
  const queued = pages.flatMap((page, index) =>
    page.state === "Queued" && !page.omitted ? [index] : [],
  );
  const controlsDisabled = disabled || busy || opening || !supported;
  return (
    <div className="min-w-0 space-y-3" data-testid="photo-ocr-panel">
      {!supported ? (
        <p role="alert">
          Photo reading isn't supported in this browser. Use Upload file or
          Paste text.
        </p>
      ) : (
        <div className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-4 text-center">
          <div className="flex flex-wrap justify-center gap-3">
            <label
              className={`${controlClass} cursor-pointer has-[:focus-visible]:ring-2`}
            >
              Take photo
              <input
                id="study-guide-camera"
                type="file"
                accept={PHOTO_OCR_ACCEPT}
                capture="environment"
                className="sr-only"
                disabled={controlsDisabled}
                onChange={choose}
                aria-describedby="study-guide-photos-hint"
              />
            </label>
            <label
              className={`${controlClass} cursor-pointer has-[:focus-visible]:ring-2`}
            >
              Choose files
              <input
                id="study-guide-photos"
                type="file"
                multiple
                accept={OCR_FILE_ACCEPT}
                className="sr-only"
                disabled={controlsDisabled}
                onChange={choose}
                aria-describedby="study-guide-photos-hint"
              />
            </label>
          </div>
          <p
            id="study-guide-photos-hint"
            className="mt-2 text-xs text-gray-500"
          >
            JPEG, PNG or browser-supported HEIC · up to 20 photos · up to 10 MB
            each, or one PDF · up to 20 pages · up to{" "}
            {maxFileBytes.toLocaleString()} bytes. English text only. Text is
            read on your device; photos and scans are not uploaded for
            recognition.
          </p>
        </div>
      )}
      <p role="status" aria-live="polite" className="text-sm text-gray-700">
        {opening ? "Opening PDF…" : announcement}
      </p>
      {pages.length > 0 && (
        <>
          <p className="text-sm">
            Selected {pages.length} page{pages.length === 1 ? "" : "s"}.
          </p>
          <ol className="space-y-2">
            {pages.map((page, index) => (
              <li
                key={index}
                aria-label={`Page ${index + 1}`}
                className="min-w-0 rounded-md border border-gray-200 p-3 text-sm [overflow-wrap:anywhere]"
              >
                <p>
                  {page.name} · {page.state}
                  {page.omitted ? " · Omitted" : ""}
                </p>
                {page.error && (
                  <p role="alert" className="text-red-700">
                    {page.error}
                  </p>
                )}
                {!busy &&
                  !opening &&
                  !page.omitted &&
                  (page.state === "Failed" ||
                    page.state === "No text found") && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={controlClass}
                        disabled={disabled}
                        onClick={() => void run([index])}
                      >
                        Retry page {index + 1}
                      </button>
                      <button
                        type="button"
                        className={controlClass}
                        disabled={disabled}
                        onClick={() => omit(index)}
                      >
                        Continue without page {index + 1}
                      </button>
                    </div>
                  )}
              </li>
            ))}
          </ol>
        </>
      )}
      {busy && (
        <div className="space-y-2">
          <p>
            {cancelling
              ? "Cancelling after this page…"
              : `Reading page ${currentIndex + 1} of ${pages.length}`}
          </p>
          <div
            role="progressbar"
            aria-label="Pages read"
            aria-valuemin={0}
            aria-valuemax={pages.length}
            aria-valuenow={Math.max(1, currentIndex + 1)}
            aria-valuetext={`Reading page ${currentIndex + 1} of ${pages.length}`}
            className="h-2 overflow-hidden rounded bg-gray-200"
          >
            <div
              className="h-full bg-indigo-600"
              style={{ width: `${(Math.max(1, currentIndex + 1) / pages.length) * 100}%` }}
            />
          </div>
          <button
            type="button"
            className={controlClass}
            disabled={cancelling}
            onClick={() => {
              cancelRequested.current = true;
              setCancelling(true);
            }}
          >
            Cancel
          </button>
        </div>
      )}
      {!busy && !opening && queued.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={controlClass}
            disabled={disabled}
            onClick={() => void run(queued)}
          >
            {pages.every((page) => page.state === "Queued")
              ? `Read ${pages.length} page${pages.length === 1 ? "" : "s"}`
              : "Resume reading"}
          </button>
          {queued.map((index) => (
            <button
              key={index}
              type="button"
              className={controlClass}
              disabled={disabled}
              onClick={() => omit(index)}
            >
              Continue without page {index + 1}
            </button>
          ))}
        </div>
      )}
      {message && (
        <p role={messageIsError ? "alert" : "status"} className="text-sm text-gray-700">
          {message}
        </p>
      )}
      {replacement !== null && !busy && (
        <div className="space-y-2 text-sm">
          <p>Your edited review is kept. A new reading is ready.</p>
          <button
            type="button"
            className={controlClass}
            disabled={disabled}
            onClick={() => {
              lastPublished.current = replacement;
              callbacks.current.onRecognized(replacement);
              setReplacement(null);
              callbacks.current.onReviewReady?.();
            }}
          >
            Replace review with new reading
          </button>
        </div>
      )}
      {pages.some((page) => !page.omitted && page.state !== "Done") &&
        !busy && (
          <p className="text-sm">
            Read, retry or choose Continue without each remaining page before
            submitting.
          </p>
        )}
    </div>
  );
}
