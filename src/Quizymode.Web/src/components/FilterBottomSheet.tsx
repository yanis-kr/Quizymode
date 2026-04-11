/**
 * Mobile-first bottom sheet for filter content. Slides up from the bottom on mobile;
 * appears as a centered modal on larger screens.
 */
import { useEffect, type ReactNode } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

interface FilterBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onClearAll: () => void;
  hasActiveFilters: boolean;
  children: ReactNode;
}

export function FilterBottomSheet({
  isOpen,
  onClose,
  onClearAll,
  hasActiveFilters,
  children,
}: FilterBottomSheetProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col justify-end sm:items-center sm:justify-center"
      aria-modal="true"
      role="dialog"
      aria-label="Filters"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative w-full bg-white shadow-2xl rounded-t-3xl sm:rounded-2xl sm:max-w-lg sm:mx-4 max-h-[85dvh] flex flex-col">
        {/* Drag handle (mobile only) */}
        <div className="flex justify-center pt-2.5 pb-0.5 sm:hidden">
          <div className="w-9 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Filters</h2>
          <div className="flex items-center gap-3">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={onClearAll}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Clear all
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              aria-label="Close filters"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {children}
        </div>

        {/* Apply button */}
        <div className="px-4 py-3 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition"
          >
            Show results
          </button>
        </div>
      </div>
    </div>
  );
}
