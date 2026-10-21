import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ShareResultButton } from "./ShareResultButton";
import type { ResultShareDescriptor } from "./resultShare";
import { useStudyHotkeys } from "@/components/study/useStudyHotkeys";

const { trackShared } = vi.hoisted(() => ({ trackShared: vi.fn() }));
vi.mock("./quizAnalytics", () => ({ trackQuizResultShared: trackShared }));
vi.mock("qrcode", () => ({ toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,QR") }));

const linked: ResultShareDescriptor = {
  kind: "global",
  text: "I scored 2/3 on a Quizymode quiz. Try this quiz!",
  url: "https://q.test/quiz?x=1",
};
const privateShare: ResultShareDescriptor = {
  kind: "collection",
  text: "I scored 2/3 on a Quizymode quiz.",
  isPrivateCollection: true,
};

function setNavigator(property: "clipboard" | "share", value: unknown) {
  Object.defineProperty(navigator, property, { value, configurable: true, writable: true });
}

function renderButton(descriptor = linked) {
  render(<ShareResultButton descriptor={descriptor} runId="run-1" score={2} total={3} context={{ contextType: "quiz" }} />);
  const trigger = screen.getByRole("button", { name: "Share result" });
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
}

describe("ShareResultButton", () => {
  const writeText = vi.fn();

  beforeEach(() => {
    vi.useRealTimers();
    trackShared.mockClear();
    writeText.mockReset().mockResolvedValue(undefined);
    setNavigator("clipboard", { writeText });
    setNavigator("share", undefined);
  });
  afterEach(() => setNavigator("share", undefined));

  it("opens a labelled modal dialog, focuses inside and previews the full text", () => {
    renderButton();
    const dialog = screen.getByRole("dialog", { name: "Share your result" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(screen.getByRole("textbox")).toHaveValue(`${linked.text}\n${linked.url}`);
  });

  it("copies, shows Copied., resets after 3 seconds and reports one share", async () => {
    renderButton();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await vi.waitFor(() => expect(screen.getByText("Copied.")).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledWith(`${linked.text}\n${linked.url}`);
    expect(trackShared).toHaveBeenCalledWith("run-1", 2, 3, { contextType: "quiz" });
    await act(async () => {
      vi.advanceTimersByTime(3100);
    });
    expect(screen.queryByText("Copied.")).toBeNull();
    vi.useRealTimers();
  });

  it("explains a copy failure, selects the textarea and reports nothing", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByText("Couldn't copy. Select the text above and copy it.")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveFocus();
    expect(trackShared).not.toHaveBeenCalled();
  });

  it("offers native share only when available, ignores AbortError and reports a resolved share", async () => {
    renderButton();
    expect(screen.queryByRole("button", { name: /share via/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close share dialog" }));

    const share = vi.fn().mockRejectedValueOnce(new DOMException("c", "AbortError")).mockResolvedValueOnce(undefined);
    setNavigator("share", share);
    fireEvent.click(screen.getByRole("button", { name: "Share result" }));
    fireEvent.click(screen.getByRole("button", { name: /share via/i }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(trackShared).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /share via/i }));
    await waitFor(() => expect(trackShared).toHaveBeenCalledTimes(1));
    expect(share).toHaveBeenLastCalledWith({ text: linked.text, url: linked.url });
  });

  it("shows the QR code only for linked shares", async () => {
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Show QR code" }));
    expect(await screen.findByRole("img", { name: "QR code for the shared quiz link" })).toBeInTheDocument();
  });

  it("a private share has no link, no QR button and says why", () => {
    renderButton(privateShare);
    expect(screen.getByText("Private collection: only your score is shared, with no link.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show QR code" })).toBeNull();
    expect(screen.getByRole("textbox")).toHaveValue(privateShare.text);
  });

  it.each([
    ["Escape", () => fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })],
    ["backdrop", () => fireEvent.click(screen.getByRole("dialog").parentElement!)],
    ["close button", () => fireEvent.click(screen.getByRole("button", { name: "Close share dialog" }))],
  ])("closes on %s and returns focus to Share result", (_name, close) => {
    const trigger = renderButton();
    close();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("keeps single-key study shortcuts inert while open", () => {
    const onDigit = vi.fn();
    function Probe() {
      useStudyHotkeys({ digit: onDigit });
      return null;
    }
    render(<Probe />);
    renderButton();
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "1", code: "Digit1", bubbles: true, cancelable: true }));
    });
    expect(onDigit).not.toHaveBeenCalled();
  });
});
