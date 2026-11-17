import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const worker = { recognize: vi.fn(), terminate: vi.fn() };
const createWorker = vi.fn();

vi.mock("tesseract.js", () => ({
  createWorker: (...args: unknown[]) => createWorker(...args),
}));

import { createPhotoRecognizer } from "./photoRecognizer";

function photo(): File {
  return new File(["x"], "page.png", { type: "image/png" });
}

describe("createPhotoRecognizer (AC 6.6.44, 6.6.46, 6.6.47)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    createWorker.mockReset().mockResolvedValue(worker);
    worker.recognize.mockReset().mockResolvedValue({ data: { text: "  Recognized  " } });
    worker.terminate.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 400, height: 200, close: vi.fn() })));
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
    await expect(recognizer.recognize(photo())).resolves.toBe("Recognized");
    expect(createWorker).toHaveBeenCalledWith(
      "eng",
      1,
      expect.objectContaining({
        workerPath: "/ocr/worker.min.js",
        corePath: "/ocr/core/",
        langPath: "/ocr/lang/4.0.0",
      })
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
    vi.stubGlobal("createImageBitmap", vi.fn(async () => Promise.reject(new Error("bad image"))));
    const recognizer = createPhotoRecognizer();
    await expect(recognizer.recognize(photo())).rejects.toThrow("bad image");
    recognizer.cancel();
  });
});
