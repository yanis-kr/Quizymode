import { createWorker, type Worker } from "tesseract.js";
import { PHOTO_OCR_LIMITS } from "./photoOcrLimits";

const OCR_ASSETS = {
  workerPath: "/ocr/worker.min.js",
  corePath: "/ocr/core/",
  langPath: "/ocr/lang/4.0.0",
  cacheMethod: "none" as const,
};

export interface RecognitionResult {
  text: string;
  confidence: number;
}

export interface PhotoRecognizer {
  recognize(file: File): Promise<RecognitionResult>;
  recognizeCanvas(canvas: HTMLCanvasElement): Promise<RecognitionResult>;
  recognizePage(
    render: (signal: AbortSignal) => Promise<HTMLCanvasElement>,
  ): Promise<RecognitionResult>;
  cancel(): void;
}

export async function decodePhotoToCanvas(
  file: File,
): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    const scale = Math.min(
      1,
      PHOTO_OCR_LIMITS.maxLongSide / Math.max(bitmap.width, bitmap.height),
    );
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
  let idleTimer: number | undefined;
  let generation = 0;
  let abortCurrent: (() => void) | null = null;

  const terminate = () => {
    generation += 1;
    window.clearTimeout(idleTimer);
    const current = worker;
    worker = null;
    workerPromise = null;
    if (current) void current.terminate();
  };

  const getWorker = (): Promise<Worker> => {
    if (worker) return Promise.resolve(worker);
    if (!workerPromise) {
      const startedAt = generation;
      const pending = createWorker("eng", 1, {
        ...OCR_ASSETS,
        logger: () => undefined,
      }).then((created) => {
        if (startedAt !== generation) {
          void created.terminate();
          throw new Error("Recognition was cancelled");
        }
        worker = created;
        return created;
      });
      workerPromise = pending;
      void pending.catch(() => {
        if (workerPromise === pending) workerPromise = null;
      });
    }
    return workerPromise;
  };

  const recognizePage = async (
    render: (signal: AbortSignal) => Promise<HTMLCanvasElement>,
  ): Promise<RecognitionResult> => {
    if (abortCurrent) throw new Error("A page is already being read");
    window.clearTimeout(idleTimer);
    const controller = new AbortController();
    let canvas: HTMLCanvasElement | null = null;
    let stopped = false;
    let rejectStop: (error: Error) => void = () => undefined;
    const stop = new Promise<never>((_resolve, reject) => {
      rejectStop = reject;
    });
    const abort = (reason: string) => {
      stopped = true;
      controller.abort();
      terminate();
      rejectStop(new Error(reason));
    };
    abortCurrent = () => abort("Recognition was cancelled");
    const timer = window.setTimeout(
      () => abort("Recognition took too long"),
      PHOTO_OCR_LIMITS.pageTimeoutMs,
    );
    const work = (async () => {
      const rendered = await render(controller.signal);
      if (stopped) {
        rendered.width = 0;
        rendered.height = 0;
        throw new Error("Recognition was cancelled");
      }
      canvas = rendered;
      const active = await getWorker();
      if (stopped) throw new Error("Recognition was cancelled");
      const result = await active.recognize(rendered);
      return {
        text: result.data.text.trim(),
        confidence: result.data.confidence,
      };
    })();
    try {
      return await Promise.race([work, stop]);
    } finally {
      window.clearTimeout(timer);
      abortCurrent = null;
      if (canvas) {
        const completedCanvas = canvas as HTMLCanvasElement;
        completedCanvas.width = 0;
        completedCanvas.height = 0;
      }
      if (!stopped)
        idleTimer = window.setTimeout(
          terminate,
          PHOTO_OCR_LIMITS.idleTerminateMs,
        );
    }
  };

  return {
    recognize: (file) =>
      recognizePage(async () => {
        try {
          return await decodePhotoToCanvas(file);
        } catch (error) {
          const failure = new Error(
            error instanceof Error
              ? error.message
              : "Photo could not be decoded",
          );
          failure.name = "PhotoDecodeError";
          throw failure;
        }
      }),
    recognizeCanvas: (canvas) => recognizePage(async () => canvas),
    recognizePage,
    cancel() {
      if (abortCurrent) abortCurrent();
      else terminate();
    },
  };
}
