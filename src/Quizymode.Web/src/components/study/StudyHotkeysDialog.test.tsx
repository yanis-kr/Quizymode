import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import { StudyHotkeysDialog } from "./StudyHotkeysDialog";
import { FLASHCARD_SHORTCUTS, type StudyShortcutHelp } from "./studyShortcuts";
import { resetStudyHotkeysPreferenceForTests } from "./studyHotkeysPreference";

function Host({ shortcuts = FLASHCARD_SHORTCUTS }: { shortcuts?: StudyShortcutHelp[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        opener
      </button>
      <StudyHotkeysDialog open={open} onClose={() => setOpen(false)} shortcuts={shortcuts} />
    </div>
  );
}

function openDialog() {
  const opener = screen.getByRole("button", { name: "opener" });
  opener.focus();
  fireEvent.click(opener);
  return opener;
}

describe("StudyHotkeysDialog", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    resetStudyHotkeysPreferenceForTests();
  });

  it("is a labelled modal dialog whose first focus is the Single-key shortcuts switch", () => {
    render(<Host />);
    openDialog();
    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const toggle = screen.getByRole("switch", { name: "Single-key shortcuts" });
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Flip the card")).toBeInTheDocument();
  });

  it("cycles focus with Tab and Shift+Tab", () => {
    render(<Host />);
    openDialog();
    const toggle = screen.getByRole("switch");
    const close = screen.getByRole("button", { name: "Close" });
    close.focus();
    fireEvent.keyDown(close, { key: "Tab" });
    expect(toggle).toHaveFocus();
    fireEvent.keyDown(toggle, { key: "Tab", shiftKey: true });
    expect(close).toHaveFocus();
  });

  it.each([
    ["Escape", () => fireEvent.keyDown(screen.getByRole("switch"), { key: "Escape" })],
    ["Close", () => fireEvent.click(screen.getByRole("button", { name: "Close" }))],
    ["backdrop", () => fireEvent.click(screen.getByRole("dialog").parentElement!)],
  ])("closes on %s and restores focus", (_name, close) => {
    render(<Host />);
    const opener = openDialog();
    close();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("flips the switch and persists it", () => {
    render(<Host />);
    openDialog();
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    expect(window.localStorage.getItem("quizymode.study-hotkeys.v1")).toBe("off");
  });

  it("says so when no other shortcuts apply", () => {
    render(<Host shortcuts={[]} />);
    openDialog();
    expect(screen.getByText("No other shortcuts on this screen.")).toBeInTheDocument();
  });

  it("notes when the setting cannot be saved", () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    render(<Host />);
    openDialog();
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByRole("status")).toHaveTextContent("could not be saved");
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });
});
