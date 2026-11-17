import { createWorker, type Worker } from "tesseract.js";
import { PHOTO_OCR_LIMITS } from "./photoOcrLimits";

/** Assets are served from our own origin under /ocr/ (copied from tesseract.js and @tesseract.js-data/eng). */
const OCR_ASSETS = {
  workerPath: "/ocr/worker.min.js",
  corePath: "/ocr/core/",
  langPath: "/ocr/lang/4.0.0",
} as const;

export interface PhotoRecognizer {
  /** Recognizes one photo in the browser. Rejects when the image cannot be decoded or the page takes too long. */
  recognize(file: File): Promise<string>;
  /** Recognizes a page already rendered to a canvas (scanned PDF pages). */
  recognizeCanvas(canvas: HTMLCanvasElement): Promise<string>;
  /** Stops any running recognition and frees the worker. */
  cancel(): void;
}

/** Scales a photo so its longest side is at most maxLongSide. The bitmap is closed before returning. */
export async function decodePhotoToCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, PHOTO_OCR_LIMITS.maxLongSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is not available");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    bitmap.close();
  }
}

export function createPhotoRecognizer(): PhotoRecognizer {
  let worker: Worker | null = null;
  let workerPromise: Promise<Worker> | null = null;
  let idleTimer: number | null = null;
  let generation = 0;

  const clearIdleTimer = () => {
    if (idleTimer !== null) window.clearTimeout(idleTimer);
    idleTimer = null;
  };

  const terminate = () => {
    generation += 1;
    clearIdleTimer();
    const current = worker;
    worker = null;
    workerPromise = null;
    if (current) void current.terminate();
  };

  const getWorker = (): Promise<Worker> => {
    if (worker) return Promise.resolve(worker);
    if (!workerPromise) {
      const startedAt = generation;
      workerPromise = createWorker("eng", 1, { ...OCR_ASSETS, logger: () => undefined }).then((created) => {
        // A cancel or timeout while the worker was starting terminates it straight away.
        if (startedAt !== generation) {
          void created.terminate();
          throw new Error("Recognition was cancelled");
        }
        worker = created;
        return created;
      });
      workerPromise.catch(() => {
        workerPromise = null;
      });
    }
    return workerPromise;
  };

  const scheduleIdleTerminate = () => {
    clearIdleTimer();
    idleTimer = window.setTimeout(terminate, PHOTO_OCR_LIMITS.idleTerminateMs);
  };

  return {
    async recognize(file: File): Promise<string> {
      return this.recognizeCanvas(await decodePhotoToCanvas(file));
    },
    async recognizeCanvas(canvas: HTMLCanvasElement): Promise<string> {
      clearIdleTimer();
      const runGeneration = generation;
      let timeoutId: number | undefined;
      const timeout = new Promise<never>((_resolve, reject) => {
        timeoutId = window.setTimeout(() => {
          if (runGeneration === generation) terminate();
          reject(new Error("Recognition took too long"));
        }, PHOTO_OCR_LIMITS.pageTimeoutMs);
      });
      try {
        const active = await Promise.race([getWorker(), timeout]);
        const result = await Promise.race([active.recognize(canvas), timeout]);
        return result.data.text.trim();
      } finally {
        window.clearTimeout(timeoutId);
        scheduleIdleTerminate();
      }
    },
    cancel() {
      terminate();
    },
  };
}
