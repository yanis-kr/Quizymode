import { useCallback, useState } from "react";

export type ShareCopyState = "idle" | "copied" | "failed";

export interface ShareActionsOptions {
  /** What Copy writes to the clipboard. */
  copyText: string;
  /** What the native share sheet receives. */
  shareData: ShareData;
  /** When set, a QR code can be generated for it. */
  qrValue?: string;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copy, native share and QR state shared by the collection and quiz-result share dialogs. It owns state and
 * handlers only; each dialog supplies its own strings.
 */
export function useShareActions({ copyText, shareData, qrValue }: ShareActionsOptions) {
  const [copyState, setCopyState] = useState<ShareCopyState>("idle");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);
  const [isLoadingQr, setIsLoadingQr] = useState(false);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  /** Resolves true when the text reached the clipboard. */
  const copy = useCallback(async (): Promise<boolean> => {
    const ok = await copyToClipboard(copyText);
    setCopyState(ok ? "copied" : "failed");
    return ok;
  }, [copyText]);

  /** Resolves true when the share sheet completed or the fallback copy succeeded; a cancelled sheet is false. */
  const nativeShare = async (): Promise<boolean> => {
    try {
      await navigator.share(shareData);
      return true;
    } catch (error) {
      // The user closing the share sheet is not an error; anything else falls back to copying.
      if (error instanceof DOMException && error.name === "AbortError") return false;
      return copy();
    }
  };

  const showQr = async (): Promise<void> => {
    if (!qrValue) return;
    setIsLoadingQr(true);
    setQrError(false);
    try {
      const QRCode = await import("qrcode");
      setQrDataUrl(await QRCode.toDataURL(qrValue, { width: 240, margin: 1 }));
    } catch {
      setQrError(true);
    } finally {
      setIsLoadingQr(false);
    }
  };

  const resetCopyState = useCallback(() => setCopyState("idle"), []);

  return { canNativeShare, copyState, copy, nativeShare, qrDataUrl, qrError, isLoadingQr, showQr, resetCopyState };
}
