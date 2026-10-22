import { QuestionMarkCircleIcon } from "@heroicons/react/24/outline";

/** Opens the shortcuts dialog. Icon-only below sm, labelled "Shortcuts" from sm up (AC 3.16.6). */
export function StudyHotkeysHint({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Keyboard shortcuts"
      className="inline-flex items-center gap-1 rounded-md p-1.5 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      <QuestionMarkCircleIcon className="h-5 w-5" aria-hidden="true" />
      <span className="hidden sm:inline" aria-hidden="true">
        Shortcuts
      </span>
    </button>
  );
}
