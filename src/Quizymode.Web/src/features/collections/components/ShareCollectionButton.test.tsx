import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ShareCollectionButton } from "./ShareCollectionButton";

vi.mock("qrcode", () => ({
  toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,QR"),
}));

const URL = "https://www.quizymode.com/collections/c1/biology";

function setNavigator(property: "clipboard" | "share", value: unknown) {
  Object.defineProperty(navigator, property, { value, configurable: true, writable: true });
}

describe("ShareCollectionButton", () => {
  const writeText = vi.fn();

  beforeEach(() => {
    writeText.mockReset().mockResolvedValue(undefined);
    setNavigator("clipboard", { writeText });
    setNavigator("share", undefined);
  });

  afterEach(() => {
    setNavigator("share", undefined);
  });

  function openDialog(isPublic = true) {
    render(<ShareCollectionButton url={URL} title="Biology" isPublic={isPublic} />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    return screen.getByRole("dialog", { name: /share collection/i });
  }

  it("copies the link to the clipboard", async () => {
    openDialog();

    expect(screen.getByLabelText("Collection link")).toHaveValue(URL);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL));
    expect(await screen.findByText("Link copied.")).toBeInTheDocument();
  });

  it("hides native share when the browser does not support it", () => {
    openDialog();
    expect(screen.queryByRole("button", { name: /share via/i })).not.toBeInTheDocument();
  });

  it("uses navigator.share when available", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigator("share", share);
    openDialog();

    fireEvent.click(screen.getByRole("button", { name: /share via/i }));

    await waitFor(() => expect(share).toHaveBeenCalledWith({ title: "Biology", url: URL }));
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to copying when native share fails, but not when the user cancels", async () => {
    const share = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("cancelled", "AbortError"))
      .mockRejectedValueOnce(new DOMException("not allowed", "NotAllowedError"));
    setNavigator("share", share);
    openDialog();

    fireEvent.click(screen.getByRole("button", { name: /share via/i }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(writeText).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /share via/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL));
  });

  it("reports a clipboard failure", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    openDialog();

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

    expect(await screen.findByText(/could not copy/i)).toBeInTheDocument();
  });

  it("lazy-loads a QR code for the link", async () => {
    openDialog();

    fireEvent.click(screen.getByRole("button", { name: "Show QR code" }));

    const image = await screen.findByRole("img", { name: "QR code for Biology" });
    expect(image).toHaveAttribute("src", "data:image/png;base64,QR");
    const QRCode = await import("qrcode");
    expect(QRCode.toDataURL).toHaveBeenCalledWith(URL, { width: 240, margin: 1 });
  });

  it("warns that a private collection link only works for the owner and closes on Escape", () => {
    openDialog(false);

    expect(screen.getByText(/only you can open this link/i)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
