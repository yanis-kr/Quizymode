import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import PhotoOcrPanel from "./PhotoOcrPanel";
import {
  createPhotoRecognizer,
  type RecognitionResult,
} from "../photoOcr/photoRecognizer";

vi.mock("../photoOcr/photoRecognizer", () => ({
  createPhotoRecognizer: vi.fn(),
}));
const result = (text: string, confidence = 90): RecognitionResult => ({
  text,
  confidence,
});
function photo(name = "page.jpg", bytes = 1000, type = "image/jpeg"): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: bytes });
  return file;
}
function choose(files: File[]) {
  fireEvent.change(screen.getByLabelText("Choose files"), {
    target: { files },
  });
}
describe("PhotoOcrPanel input and recovery (AC 6.6.53–6.6.61)", () => {
  let recognize: ReturnType<
    typeof vi.fn<(file: File) => Promise<RecognitionResult>>
  >;
  let cancel: ReturnType<typeof vi.fn<() => void>>;
  beforeEach(() => {
    vi.stubGlobal("Worker", class {});
    vi.stubGlobal("createImageBitmap", vi.fn());
    recognize = vi.fn();
    cancel = vi.fn();
    vi.mocked(createPhotoRecognizer).mockReturnValue({
      recognize,
      recognizeCanvas: vi.fn(),
      recognizePage: vi.fn(),
      cancel,
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("offers single rear-camera capture and a multi-file picker with visible limits", () => {
    render(<PhotoOcrPanel disabled={false} onRecognized={vi.fn()} />);
    expect(screen.getByLabelText("Take photo")).toHaveAttribute(
      "capture",
      "environment",
    );
    expect(screen.getByLabelText("Take photo")).not.toHaveAttribute("multiple");
    expect(screen.getByLabelText("Choose files")).toHaveAttribute(
      "accept",
      expect.stringContaining("application/pdf"),
    );
    expect(screen.getByText(/up to 20 photos/)).toHaveTextContent(
      /not uploaded for recognition/,
    );
  });
  it("does no work in an unsupported browser", () => {
    vi.stubGlobal("Worker", undefined);
    render(<PhotoOcrPanel disabled={false} onRecognized={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Photo reading isn't supported in this browser.",
    );
    expect(createPhotoRecognizer).not.toHaveBeenCalled();
  });
  it("rejects oversized and mixed selections before recognition", async () => {
    render(<PhotoOcrPanel disabled={false} onRecognized={vi.fn()} />);
    choose([photo("big.jpg", 10 * 1024 * 1024 + 1)]);
    expect(
      await screen.findByText("big.jpg is over 10 MB. Choose a smaller photo."),
    ).toBeInTheDocument();
    choose([photo(), photo("scan.pdf", 1000, "application/pdf")]);
    expect(
      await screen.findByText("Choose photos or one PDF at a time."),
    ).toBeInTheDocument();
    expect(recognize).not.toHaveBeenCalled();
  });
  it("publishes one ordered review and announces completion", async () => {
    recognize
      .mockResolvedValueOnce(result("First page"))
      .mockResolvedValueOnce(result("Second page"));
    const onRecognized = vi.fn();
    const onReviewReady = vi.fn();
    render(
      <PhotoOcrPanel
        disabled={false}
        onRecognized={onRecognized}
        onReviewReady={onReviewReady}
      />,
    );
    choose([photo("one.jpg"), photo("two.jpg")]);
    await waitFor(() =>
      expect(onRecognized).toHaveBeenCalledWith("First page\n\nSecond page"),
    );
    expect(onReviewReady).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Page 2 done.")).toHaveAttribute("role", "status");
  });
  it("retains other pages and gates review until a failed HEIC page is explicitly omitted", async () => {
    recognize
      .mockRejectedValueOnce(
        Object.assign(new Error("decode"), { name: "PhotoDecodeError" }),
      )
      .mockResolvedValueOnce(result("Readable text"));
    const blocked = vi.fn();
    render(
      <PhotoOcrPanel
        disabled={false}
        onRecognized={vi.fn()}
        onBlockedChange={blocked}
      />,
    );
    choose([
      photo("bad.heic", 1000, "image/heic"),
      photo("good.png", 1000, "image/png"),
    ]);
    expect(
      await screen.findByText(/This browser can't open this HEIC photo/),
    ).toBeInTheDocument();
    expect(blocked).toHaveBeenLastCalledWith(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Continue without page 1" }),
    );
    expect(blocked).toHaveBeenLastCalledWith(false);
    expect(screen.getByLabelText("Page 2")).toHaveTextContent("Done");
  });
  it("retries an empty first page without duplicating or reordering text", async () => {
    recognize
      .mockResolvedValueOnce(result(""))
      .mockResolvedValueOnce(result("Second"))
      .mockResolvedValueOnce(result("First"));
    const onRecognized = vi.fn();
    render(<PhotoOcrPanel disabled={false} onRecognized={onRecognized} />);
    choose([photo("one.jpg"), photo("two.jpg")]);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    fireEvent.click(
      await screen.findByRole("button", { name: "Retry page 1" }),
    );
    await waitFor(() =>
      expect(onRecognized).toHaveBeenLastCalledWith("First\n\nSecond"),
    );
    expect(recognize).toHaveBeenCalledTimes(3);
  });
  it("finishes the active page on cancel, keeps the selection and resumes only queued pages", async () => {
    let finish: (value: RecognitionResult) => void = () => undefined;
    recognize
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      )
      .mockResolvedValueOnce(result("Second"));
    const onRecognized = vi.fn();
    render(<PhotoOcrPanel disabled={false} onRecognized={onRecognized} />);
    choose([photo("one.jpg"), photo("two.jpg")]);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Cancelling after this page…")).toBeInTheDocument();
    await act(async () => finish(result("First")));
    expect(
      await screen.findByText(/Selection and text already read are kept/),
    ).toBeInTheDocument();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(recognize).toHaveBeenCalledTimes(1);
    expect(onRecognized).toHaveBeenLastCalledWith("First");
    fireEvent.click(screen.getByRole("button", { name: "Resume reading" }));
    await waitFor(() =>
      expect(onRecognized).toHaveBeenLastCalledWith("First\n\nSecond"),
    );
  });
  it("reports confidence below 60 without changing the text", async () => {
    recognize.mockResolvedValue(result("uncertain words", 59));
    const confidence = vi.fn();
    const onRecognized = vi.fn();
    render(
      <PhotoOcrPanel
        disabled={false}
        onRecognized={onRecognized}
        onConfidenceChange={confidence}
      />,
    );
    choose([photo()]);
    await waitFor(() => expect(confidence).toHaveBeenLastCalledWith(true));
    expect(onRecognized).toHaveBeenCalledWith("uncertain words");
  });
  it("preserves edited review until replacement is explicitly requested", async () => {
    recognize.mockResolvedValue(result("new reading"));
    const onRecognized = vi.fn();
    const { rerender } = render(
      <PhotoOcrPanel disabled={false} onRecognized={onRecognized} />,
    );
    rerender(
      <PhotoOcrPanel
        disabled={false}
        text="my edits"
        hasEditedText
        onRecognized={onRecognized}
      />,
    );
    choose([photo()]);
    const replace = await screen.findByRole("button", {
      name: "Replace review with new reading",
    });
    expect(onRecognized).not.toHaveBeenCalled();
    fireEvent.click(replace);
    expect(onRecognized).toHaveBeenCalledWith("new reading");
  });
  it("terminates on unmount and clears the parent submission lock", () => {
    recognize.mockReturnValue(new Promise(() => undefined));
    const blocked = vi.fn();
    const { unmount } = render(
      <PhotoOcrPanel
        disabled={false}
        onRecognized={vi.fn()}
        onBlockedChange={blocked}
      />,
    );
    choose([photo()]);
    unmount();
    expect(cancel).toHaveBeenCalled();
    expect(blocked).toHaveBeenLastCalledWith(false);
  });

  it("preserves a deliberately cleared review until replacement is requested", async () => {
    recognize.mockResolvedValue(result("new reading"));
    const onRecognized = vi.fn();
    render(<PhotoOcrPanel disabled={false} text="" hasEditedText onRecognized={onRecognized} />);
    choose([photo()]);
    const replace = await screen.findByRole("button", { name: "Replace review with new reading" });
    expect(onRecognized).not.toHaveBeenCalled();
    fireEvent.click(replace);
    expect(onRecognized).toHaveBeenCalledWith("new reading");
  });
});
