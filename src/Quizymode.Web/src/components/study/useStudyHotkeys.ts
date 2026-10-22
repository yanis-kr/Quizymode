import { useCallback, useEffect, useRef, useState } from "react";
import { getStudyHotkeysEnabled } from "./studyHotkeysPreference";

export interface StudyHotkeyBindings {
  /** False turns every shortcut off, including "?". */
  enabled?: boolean;
  /** Space and Enter (Enter uses `enter` instead when that is set). */
  flip?: () => void;
  /** Enter only. */
  enter?: () => void;
  prev?: () => void;
  next?: () => void;
  /** 1-4 on the top row or numpad, with or without Shift. */
  digit?: (n: number) => void;
  /** A-D, passed as 0-3. */
  letter?: (index: number) => void;
}

const INTERACTIVE_SELECTOR = 'button, a[href], [role="button"], [role="switch"], summary';
const TEXT_SELECTOR = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"], [role="combobox"]';
const ARROW_OWNER_SELECTOR = 'input[type="range"], [role="slider"], [role="listbox"], [role="radiogroup"], [role="tablist"]';

function isDisabled(element: Element): boolean {
  return element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true";
}

function digitFromCode(code: string): number | null {
  const match = /^(?:Digit|Numpad)([1-4])$/.exec(code);
  return match ? Number(match[1]) : null;
}

/**
 * Single-key study shortcuts (AC 3.16). Handled keys call preventDefault. `?` opens the help dialog that
 * the page renders with <StudyHotkeysDialog/>.
 */
export function useStudyHotkeys(bindings: StudyHotkeyBindings): {
  isHelpOpen: boolean;
  openHelp: () => void;
  closeHelp: () => void;
} {
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const bindingsRef = useRef(bindings);
  useEffect(() => {
    bindingsRef.current = bindings;
  });

  const openHelp = useCallback(() => setIsHelpOpen(true), []);
  const closeHelp = useCallback(() => setIsHelpOpen(false), []);

  useEffect(() => {
    const handle = (event: KeyboardEvent): void => {
      const current = bindingsRef.current;
      if (current.enabled === false || !getStudyHotkeysEnabled()) return;
      if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229) return;
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (document.querySelector('[role="dialog"],[aria-modal="true"]')) return;

      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(TEXT_SELECTOR) || (target instanceof HTMLElement && target.isContentEditable)) return;

      let action: (() => void) | undefined;
      if (event.key === "?") {
        action = () => setIsHelpOpen(true);
      } else if (event.key === " " || event.key === "Enter") {
        // An enabled focused control activates itself exactly once; a disabled one does not block.
        const control = target?.closest(INTERACTIVE_SELECTOR);
        if (control && !isDisabled(control)) return;
        action = event.key === "Enter" ? (current.enter ?? current.flip) : current.flip;
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        if (target?.closest(ARROW_OWNER_SELECTOR)) return;
        action = event.key === "ArrowLeft" ? current.prev : current.next;
      } else {
        const digit = digitFromCode(event.code);
        if (digit !== null) {
          if (current.digit) {
            const handler = current.digit;
            action = () => handler(digit);
          }
        } else if (/^[a-dA-D]$/.test(event.key) && current.letter) {
          const handler = current.letter;
          const index = event.key.toLowerCase().charCodeAt(0) - 97;
          action = () => handler(index);
        }
      }

      if (!action) return;
      event.preventDefault();
      action();
    };

    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, []);

  return { isHelpOpen, openHelp, closeHelp };
}
