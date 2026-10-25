import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { shouldIgnoreSingleKeyHotkey, isDialogOpen } from "@/components/study/useStudyHotkeys";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import SearchCombobox from "./SearchCombobox";
import SearchOverlay from "./SearchOverlay";

/** Inline input at xl and up; below xl an icon opens the full-screen overlay. Exactly one variant renders. */
const INLINE_QUERY = "(min-width: 1280px)";

interface GlobalSearchProps {
  /** Called when the search opens, so the host can close its own menus. */
  onOpen?: () => void;
}

function getShortcutHint(): string {
  return /Mac|iPhone|iPad/.test(window.navigator.userAgent) ? "⌘K" : "Ctrl K";
}

const GlobalSearch = ({ onOpen }: GlobalSearchProps) => {
  const isInline = useMediaQuery(INLINE_QUERY);
  const location = useLocation();
  const [value, setValue] = useState("");
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [openedByShortcut, setOpenedByShortcut] = useState(false);
  const [routeKey, setRouteKey] = useState(location.key);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const overlayInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Any route change, and crossing into the inline breakpoint, closes the overlay (the text is kept).
  if (routeKey !== location.key) {
    setRouteKey(location.key);
    setOverlayOpen(false);
  }
  if (isInline && overlayOpen) {
    setOverlayOpen(false);
  }

  const openOverlay = (byShortcut: boolean) => {
    onOpen?.();
    setOpenedByShortcut(byShortcut);
    setOverlayOpen(true);
  };

  const closeOverlay = (restoreFocus: boolean) => {
    setOverlayOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  };

  // Focus the search target for the current variant, selecting any text already typed.
  const focusSearch = () => {
    if (isInline) {
      inlineInputRef.current?.focus();
      inlineInputRef.current?.select();
    } else if (overlayOpen) {
      overlayInputRef.current?.focus();
      overlayInputRef.current?.select();
    } else {
      openOverlay(true);
    }
  };
  const focusSearchRef = useRef(focusSearch);
  useEffect(() => {
    focusSearchRef.current = focusSearch;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isCtrlK = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k";
      const isSlash = event.key === "/" && !shouldIgnoreSingleKeyHotkey(event);
      if (!isCtrlK && !isSlash) {
        return;
      }

      if (isCtrlK) {
        if (event.defaultPrevented || event.isComposing) {
          return;
        }
        // Another dialog owns the keyboard (our own overlay is the exception: Ctrl+K refocuses it).
        const otherDialog = isDialogOpen() && !document.querySelector("[data-global-search-overlay]");
        if (otherDialog) {
          return;
        }
      }

      event.preventDefault();
      focusSearchRef.current();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const shortcutHint = getShortcutHint();

  if (isInline) {
    return (
      <div className="mr-3">
        <SearchCombobox
          variant="inline"
          value={value}
          onValueChange={setValue}
          inputRef={inlineInputRef}
          onNavigated={() => undefined}
          shortcutHint={shortcutHint}
        />
      </div>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Search"
        title={`Search (${shortcutHint === "⌘K" ? "⌘K" : "Ctrl+K"})`}
        aria-haspopup="dialog"
        aria-expanded={overlayOpen}
        aria-keyshortcuts="Control+K Meta+K"
        onClick={() => openOverlay(false)}
        className="mr-1 inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 lg:mr-3"
      >
        <MagnifyingGlassIcon className="h-6 w-6" aria-hidden="true" />
      </button>
      {overlayOpen && (
        <SearchOverlay onClose={() => closeOverlay(true)}>
          <OverlayBody
            value={value}
            onValueChange={setValue}
            inputRef={overlayInputRef}
            selectOnOpen={openedByShortcut}
            onCancel={() => closeOverlay(true)}
            onNavigated={() => closeOverlay(false)}
            shortcutHint={shortcutHint}
          />
        </SearchOverlay>
      )}
    </>
  );
};

interface OverlayBodyProps {
  value: string;
  onValueChange: (value: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  selectOnOpen: boolean;
  onCancel: () => void;
  onNavigated: () => void;
  shortcutHint: string;
}

/** Focuses the input as the overlay mounts (selecting the text when opened by a shortcut). */
function OverlayBody({ selectOnOpen, inputRef, ...rest }: OverlayBodyProps) {
  useEffect(() => {
    inputRef.current?.focus();
    if (selectOnOpen) {
      inputRef.current?.select();
    }
    // Only on mount: later keystrokes must not re-select.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <SearchCombobox variant="overlay" inputRef={inputRef} {...rest} />;
}

export default GlobalSearch;
