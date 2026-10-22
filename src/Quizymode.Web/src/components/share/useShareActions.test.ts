import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useShareActions } from "./useShareActions";

vi.mock("qrcode", () => ({ toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,QR") }));

function setNavigator(property: "clipboard" | "share", value: unknown) {
  Object.defineProperty(navigator, property, { value, configurable: true, writable: true });
}

describe("useShareActions", () => {
  const writeText = vi.fn();
  const options = { copyText: "hello", shareData: { text: "hello" }, qrValue: "https://x.test" };

  beforeEach(() => {
    writeText.mockReset().mockResolvedValue(undefined);
    setNavigator("clipboard", { writeText });
    setNavigator("share", undefined);
  });
  afterEach(() => setNavigator("share", undefined));

  it("copies and reports success or failure", async () => {
    const { result } = renderHook(() => useShareActions(options));
    let ok = false;
    await act(async () => {
      ok = await result.current.copy();
    });
    expect(ok).toBe(true);
    expect(result.current.copyState).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("hello");

    writeText.mockRejectedValue(new Error("denied"));
    await act(async () => {
      ok = await result.current.copy();
    });
    expect(ok).toBe(false);
    expect(result.current.copyState).toBe("failed");
    act(() => result.current.resetCopyState());
    expect(result.current.copyState).toBe("idle");
  });

  it("treats a missing clipboard as a failure", async () => {
    setNavigator("clipboard", undefined);
    const { result } = renderHook(() => useShareActions(options));
    await act(async () => {
      await result.current.copy();
    });
    expect(result.current.copyState).toBe("failed");
  });

  it("native share resolves true, stays silent on AbortError and copies on other errors", async () => {
    const share = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new DOMException("cancelled", "AbortError"))
      .mockRejectedValueOnce(new DOMException("nope", "NotAllowedError"));
    setNavigator("share", share);
    const { result } = renderHook(() => useShareActions(options));
    expect(result.current.canNativeShare).toBe(true);

    const outcomes: boolean[] = [];
    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        outcomes.push(await result.current.nativeShare());
      });
    }
    expect(outcomes).toEqual([true, false, true]);
    expect(share).toHaveBeenCalledWith({ text: "hello" });
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it("builds a QR code on demand and reports failures", async () => {
    const { result } = renderHook(() => useShareActions(options));
    await act(async () => result.current.showQr());
    expect(result.current.qrDataUrl).toBe("data:image/png;base64,QR");

    const QRCode = await import("qrcode");
    vi.mocked(QRCode.toDataURL).mockRejectedValueOnce(new Error("boom") as never);
    await act(async () => result.current.showQr());
    expect(result.current.qrError).toBe(true);
  });
});
