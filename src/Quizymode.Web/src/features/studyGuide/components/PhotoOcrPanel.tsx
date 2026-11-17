import * as React from "react";
import { createPhotoRecognizer, type PhotoRecognizer } from "../photoOcr/photoRecognizer";
import {
  PHOTO_OCR_ACCEPT,
  PHOTO_OCR_LIMITS,
  photoReadFailureMessage,
  validatePhotoSelection,
} from "../photoOcr/photoOcrLimits";

interface PhotoOcrPanelProps {
  disabled: boolean;
  /** Called once per photo with its recognized text, so text reaches the form even if a later photo is cancelled. */
  onRecognized: (text: string) => void;
}

/** "Photos or scan" input: reads JPEG and PNG photos in the browser and hands the text to the review box. */
export default function PhotoOcrPanel({ disabled, onRecognized }: PhotoOcrPanelProps) {
  const recognizerRef = React.useRef<PhotoRecognizer | null>(null);
  const runIdRef = React.useRef(0);
  const [running, setRunning] = React.useState(false);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [failures, setFailures] = React.useState<string[]>([]);
  const [selectedCount, setSelectedCount] = React.useState<number | null>(null);

  const getRecognizer = () => {
    if (!recognizerRef.current) recognizerRef.current = createPhotoRecognizer();
    return recognizerRef.current;
  };

  // Frees the worker when the tab is left or the page closes.
  React.useEffect(() => {
    return () => {
      runIdRef.current += 1;
      recognizerRef.current?.cancel();
      recognizerRef.current = null;
    };
  }, []);

  const cancelRun = () => {
    runIdRef.current += 1;
    recognizerRef.current?.cancel();
    recognizerRef.current = null;
    setRunning(false);
    setProgress(null);
    setMessage("Recognition cancelled. Text from photos already read is kept.");
  };

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
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
      setProgress({ done: index, total: files.length });
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

  const busy = disabled || running;

  return (
    <div className="space-y-3" data-testid="photo-ocr-panel">
      <div className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-4 text-center">
        <label
          htmlFor="study-guide-photos"
          className={`inline-block rounded-md border border-gray-300 bg-surface px-3 py-1.5 text-sm font-medium text-gray-700 ${
            busy ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-gray-50"
          } has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500`}
        >
          Choose photos
          <input
            id="study-guide-photos"
            type="file"
            multiple
            accept={PHOTO_OCR_ACCEPT}
            className="sr-only"
            aria-describedby="study-guide-photos-hint"
            disabled={busy}
            onChange={handleChange}
          />
        </label>
        <p id="study-guide-photos-hint" className="mt-2 text-xs text-gray-500">
          JPEG or PNG · up to {PHOTO_OCR_LIMITS.maxImages} photos · up to 10 MB each · English text only. Text is
          read on your device; the photos are not uploaded for recognition.
        </p>
        {selectedCount !== null && !running && (
          <p className="mt-2 text-xs text-gray-600">Selected {selectedCount} photo{selectedCount === 1 ? "" : "s"}.</p>
        )}
      </div>

      {running && progress && (
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" className="text-sm text-gray-700">
            Reading photo {Math.min(progress.done + 1, progress.total)} of {progress.total}…
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
