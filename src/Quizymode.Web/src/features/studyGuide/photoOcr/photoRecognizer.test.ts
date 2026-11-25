import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const worker = { recognize: vi.fn(), terminate: vi.fn() };
const createWorker = vi.fn();

vi.mock("tesseract.js", () => ({
  createWorker: (...args: unknown[]) => createWorker(...args),
}));

import { createPhotoRecognizer, decodePhotoToCanvas } from "./photoRecognizer";

function photo(): File {
  return new File(["x"], "page.png", { type: "image/png" });
}

describe("createPhotoRecognizer (AC 6.6.44, 6.6.46, 6.6.47)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    createWorker.mockReset().mockResolvedValue(worker);
    worker.recognize
      .mockReset()
      .mockResolvedValue({ data: { text: "  Recognized  ", confidence: 91 } });
    worker.terminate.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 400, height: 200, close: vi.fn() })),
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads the worker, core and language data from our own /ocr/ path", async () => {
    const recognizer = createPhotoRecognizer();
    await expect(recognizer.recognize(photo())).resolves.toEqual({
      text: "Recognized",
      confidence: 91,
    });
    expect(createWorker).toHaveBeenCalledWith(
      "eng",
      1,
      expect.objectContaining({
        workerPath: "/ocr/worker.min.js",
        corePath: "/ocr/core/",
        langPath: "/ocr/lang/4.0.0",
      }),
    );
    recognizer.cancel();
  });

  it("reuses one worker for several photos", async () => {
    const recognizer = createPhotoRecognizer();
    await recognizer.recognize(photo());
    await recognizer.recognize(photo());
    expect(createWorker).toHaveBeenCalledTimes(1);
    recognizer.cancel();
  });

  it("terminates the worker on cancel and starts a fresh one next time", async () => {
    const recognizer = createPhotoRecognizer();
    await recognizer.recognize(photo());
    recognizer.cancel();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    await recognizer.recognize(photo());
    expect(createWorker).toHaveBeenCalledTimes(2);
    recognizer.cancel();
  });

  it("terminates the worker after two minutes without a photo", async () => {
    const recognizer = createPhotoRecognizer();
    await recognizer.recognize(photo());
    vi.advanceTimersByTime(119_000);
    expect(worker.terminate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("rejects a photo that cannot be decoded", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => Promise.reject(new Error("bad image"))),
    );
    const recognizer = createPhotoRecognizer();
    await expect(recognizer.recognize(photo())).rejects.toThrow("bad image");
    recognizer.cancel();
  });

  it("honors EXIF orientation, caps dimensions and closes the bitmap", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 4000, height: 3000, close })),
    );
    const canvas = await decodePhotoToCanvas(photo());
    expect(createImageBitmap).toHaveBeenCalledWith(expect.any(File), {
      imageOrientation: "from-image",
    });
    expect([canvas.width, canvas.height]).toEqual([2000, 1500]);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("times out decoding and releases a canvas that arrives after the deadline", async () => {
    let finish: (canvas: HTMLCanvasElement) => void = () => undefined;
    const recognizer = createPhotoRecognizer();
    const reading = recognizer.recognizePage(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const assertion = expect(reading).rejects.toThrow(
      "Recognition took too long",
    );
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
    const late = document.createElement("canvas");
    late.width = 500;
    finish(late);
    await Promise.resolve();
    expect(late.width).toBe(0);
    expect(createWorker).not.toHaveBeenCalled();
  });

  it("settles in-flight recognition on cancel and frees its canvas", async () => {
    worker.recognize.mockReturnValue(new Promise(() => undefined));
    const recognizer = createPhotoRecognizer();
    const canvas = document.createElement("canvas");
    const reading = recognizer.recognizeCanvas(canvas);
    const assertion = expect(reading).rejects.toThrow(
      "Recognition was cancelled",
    );
    await Promise.resolve();
    await Promise.resolve();
    recognizer.cancel();
    await assertion;
    expect(canvas.width).toBe(0);
  });

  it("rejects a concurrent page without starting another worker", async () => {
    const recognizer = createPhotoRecognizer();
    const reading = recognizer.recognizePage(
      () => new Promise(() => undefined),
    );
    const assertion = expect(reading).rejects.toThrow("cancelled");
    await expect(recognizer.recognize(photo())).rejects.toThrow(
      "already being read",
    );
    recognizer.cancel();
    await assertion;
  });
});
