import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PhotoOcrPanel from "./PhotoOcrPanel";
import { createPhotoRecognizer } from "../photoOcr/photoRecognizer";

vi.mock("../photoOcr/photoRecognizer", () => ({
  createPhotoRecognizer: vi.fn(),
}));

function photo(name: string, bytes = 1000, type = "image/jpeg"): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: bytes });
  return file;
}

function choose(files: File[]) {
  fireEvent.change(screen.getByLabelText(/choose photos/i), { target: { files } });
}

describe("PhotoOcrPanel (AC 6.6.43, 6.6.45, 6.6.46, 6.6.47)", () => {
  let recognize: ReturnType<typeof vi.fn<(file: File) => Promise<string>>>;
  let cancel: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    recognize = vi.fn<(file: File) => Promise<string>>();
    cancel = vi.fn<() => void>();
    vi.mocked(createPhotoRecognizer).mockReturnValue({ recognize, recognizeCanvas: vi.fn(), cancel });
  });

  it("shows the limits and the on-device note next to the chooser", () => {
    render(<PhotoOcrPanel disabled={false} onRecognized={vi.fn()} />);
    expect(screen.getByText(/up to 20 photos/i)).toBeInTheDocument();
    expect(screen.getByText(/not uploaded for recognition/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/choose photos/i)).toHaveAttribute("accept", expect.stringContaining("image/jpeg"));
  });

  it("blocks an oversized photo before any recognition starts", async () => {
    const onRecognized = vi.fn();
    render(<PhotoOcrPanel disabled={false} onRecognized={onRecognized} />);
    choose([photo("big.jpg", 10 * 1024 * 1024 + 1)]);
    expect(await screen.findByText("big.jpg is over 10 MB. Choose a smaller photo.")).toBeInTheDocument();
    expect(recognize).not.toHaveBeenCalled();
    expect(onRecognized).not.toHaveBeenCalled();
  });

  it("reads each photo in order and passes each text to the form", async () => {
    recognize.mockResolvedValueOnce("First page").mockResolvedValueOnce("Second page");
    const onRecognized = vi.fn();
    render(<PhotoOcrPanel disabled={false} onRecognized={onRecognized} />);
    choose([photo("one.jpg"), photo("two.jpg")]);

    await waitFor(() => expect(onRecognized).toHaveBeenCalledTimes(2));
    expect(onRecognized.mock.calls).toEqual([["First page"], ["Second page"]]);
    expect(await screen.findByText(/read 2 of 2 photos/i)).toBeInTheDocument();
  });

  it("fails only the photo that cannot be read and keeps the others", async () => {
    recognize.mockRejectedValueOnce(new Error("decode")).mockResolvedValueOnce("Readable text");
    const onRecognized = vi.fn();
    render(<PhotoOcrPanel disabled={false} onRecognized={onRecognized} />);
    choose([photo("bad.heic", 1000, "image/heic"), photo("good.png", 1000, "image/png")]);

    expect(
      await screen.findByText("bad.heic could not be read. Try a JPEG or PNG photo, or type the text instead.")
    ).toBeInTheDocument();
    expect(onRecognized).toHaveBeenCalledWith("Readable text");
    expect(onRecognized).toHaveBeenCalledTimes(1);
  });

  it("cancel stops the run, keeps the text already read, and cancels the recognizer", async () => {
    let finishSecond: (text: string) => void = () => undefined;
    recognize
      .mockResolvedValueOnce("Kept text")
      .mockReturnValueOnce(new Promise<string>((resolve) => (finishSecond = resolve)));
    const onRecognized = vi.fn();
    render(<PhotoOcrPanel disabled={false} onRecognized={onRecognized} />);
    choose([photo("one.jpg"), photo("two.jpg")]);

    fireEvent.click(await screen.findByRole("button", { name: /^cancel$/i }));
    finishSecond("Late text");

    expect(await screen.findByText(/text already read is kept/i)).toBeInTheDocument();
    expect(cancel).toHaveBeenCalled();
    expect(onRecognized).toHaveBeenCalledWith("Kept text");
    expect(onRecognized).not.toHaveBeenCalledWith("Late text");
  });

  it("frees the recognizer when the panel leaves the page", () => {
    const { unmount } = render(<PhotoOcrPanel disabled={false} onRecognized={vi.fn()} />);
    choose([photo("one.jpg")]);
    unmount();
    expect(cancel).toHaveBeenCalled();
  });
});
