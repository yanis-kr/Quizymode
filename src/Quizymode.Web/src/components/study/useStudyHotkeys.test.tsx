import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import { useStudyHotkeys, type StudyHotkeyBindings } from "./useStudyHotkeys";
import { resetStudyHotkeysPreferenceForTests, setStudyHotkeysEnabled } from "./studyHotkeysPreference";

function Harness({ bindings }: { bindings: StudyHotkeyBindings }) {
  const { isHelpOpen } = useStudyHotkeys(bindings);
  return (
    <div>
      <input aria-label="text" />
      <button type="button">enabled button</button>
      <button type="button" disabled>
        disabled button
      </button>
      <div role="slider" tabIndex={0} aria-label="slider" />
      <span data-testid="help">{isHelpOpen ? "open" : "closed"}</span>
    </div>
  );
}

function press(target: Element | Document, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

describe("useStudyHotkeys", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    resetStudyHotkeysPreferenceForTests();
  });

  it("flips on Space and Enter and prevents the default", () => {
    const flip = vi.fn();
    render(<Harness bindings={{ flip }} />);
    const space = press(document.body, { key: " ", code: "Space" });
    press(document.body, { key: "Enter", code: "Enter" });
    expect(flip).toHaveBeenCalledTimes(2);
    expect(space.defaultPrevented).toBe(true);
  });

  it("uses the Enter-only binding for Enter and Space still flips", () => {
    const flip = vi.fn();
    const enter = vi.fn();
    render(<Harness bindings={{ flip, enter }} />);
    press(document.body, { key: "Enter", code: "Enter" });
    press(document.body, { key: " ", code: "Space" });
    expect(enter).toHaveBeenCalledTimes(1);
    expect(flip).toHaveBeenCalledTimes(1);
  });

  it("matches digits by code so Shift and numpad work", () => {
    const digit = vi.fn();
    render(<Harness bindings={{ digit }} />);
    press(document.body, { key: "&", code: "Digit1", shiftKey: true });
    press(document.body, { key: "3", code: "Numpad3" });
    press(document.body, { key: "5", code: "Digit5" });
    expect(digit.mock.calls).toEqual([[1], [3]]);
  });

  it("maps A-D to indexes and ignores other letters", () => {
    const letter = vi.fn();
    render(<Harness bindings={{ letter }} />);
    press(document.body, { key: "b", code: "KeyB" });
    press(document.body, { key: "D", code: "KeyD", shiftKey: true });
    press(document.body, { key: "e", code: "KeyE" });
    expect(letter.mock.calls).toEqual([[1], [3]]);
  });

  it("maps F to the flag binding and ignores it without one", () => {
    const flag = vi.fn();
    render(<Harness bindings={{ flag }} />);
    press(document.body, { key: "f", code: "KeyF" });
    press(document.body, { key: "F", code: "KeyF", shiftKey: true });
    expect(flag).toHaveBeenCalledTimes(2);
    const idle = press(document.body, { key: "f", code: "KeyF" });
    expect(flag).toHaveBeenCalledTimes(3);
    expect(idle.defaultPrevented).toBe(true);
  });

  it("does nothing for F when no flag binding is set", () => {
    render(<Harness bindings={{}} />);
    expect(press(document.body, { key: "f", code: "KeyF" }).defaultPrevented).toBe(false);
  });

  it("is ignored in text fields, with modifiers, composing, repeating, or already handled", () => {
    const next = vi.fn();
    render(<Harness bindings={{ next }} />);
    press(screen.getByLabelText("text"), { key: "ArrowRight" });
    press(document.body, { key: "ArrowRight", ctrlKey: true });
    press(document.body, { key: "ArrowRight", altKey: true });
    press(document.body, { key: "ArrowRight", metaKey: true });
    press(document.body, { key: "ArrowRight", isComposing: true });
    press(document.body, { key: "ArrowRight", repeat: true });
    const handled = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
    handled.preventDefault();
    act(() => {
      document.body.dispatchEvent(handled);
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("lets an enabled focused button activate itself but not a disabled one", () => {
    const flip = vi.fn();
    render(<Harness bindings={{ flip }} />);
    press(screen.getByRole("button", { name: "enabled button" }), { key: "Enter" });
    expect(flip).not.toHaveBeenCalled();
    press(screen.getByRole("button", { name: "disabled button" }), { key: "Enter" });
    expect(flip).toHaveBeenCalledTimes(1);
  });

  it("leaves arrows to sliders", () => {
    const next = vi.fn();
    render(<Harness bindings={{ next }} />);
    press(screen.getByRole("slider"), { key: "ArrowRight" });
    expect(next).not.toHaveBeenCalled();
  });

  it("is blocked while a dialog is mounted", () => {
    const flip = vi.fn();
    render(
      <>
        <Harness bindings={{ flip }} />
        <div role="dialog" aria-modal="true" />
      </>
    );
    press(document.body, { key: " ", code: "Space" });
    press(document.body, { key: "?" });
    expect(flip).not.toHaveBeenCalled();
    expect(screen.getByTestId("help")).toHaveTextContent("closed");
  });

  it("opens help on ? and is inert when disabled or when the preference is off", () => {
    const flip = vi.fn();
    const { rerender } = render(<Harness bindings={{ flip }} />);
    press(document.body, { key: "?" });
    expect(screen.getByTestId("help")).toHaveTextContent("open");

    rerender(<Harness bindings={{ flip, enabled: false }} />);
    press(document.body, { key: " ", code: "Space" });
    expect(flip).not.toHaveBeenCalled();

    rerender(<Harness bindings={{ flip }} />);
    act(() => setStudyHotkeysEnabled(false));
    press(document.body, { key: " ", code: "Space" });
    expect(flip).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "?" });
    expect(flip).not.toHaveBeenCalled();
  });

  it("does not prevent default for keys without a binding", () => {
    render(<Harness bindings={{}} />);
    expect(press(document.body, { key: " ", code: "Space" }).defaultPrevented).toBe(false);
    expect(press(document.body, { key: "ArrowLeft" }).defaultPrevented).toBe(false);
  });
});
