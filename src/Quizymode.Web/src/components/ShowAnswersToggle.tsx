interface ShowAnswersToggleProps {
  showAnswers: boolean;
  onToggle: () => void;
  /** True while a signed-in visitor's saved setting is still loading. */
  disabled?: boolean;
}

/**
 * Page-level "Show answers" switch (#647). The label stays stable and aria-pressed carries the state, so a screen
 * reader hears "Show answers, pressed". No eye icon: the eye already means "View item details" in list cards.
 */
export function ShowAnswersToggle({ showAnswers, onToggle, disabled = false }: ShowAnswersToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={showAnswers}
      disabled={disabled}
      className={`inline-flex min-h-[44px] items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition disabled:cursor-wait disabled:opacity-60 ${
        showAnswers
          ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
          : "border-gray-200 bg-surface text-gray-600 hover:bg-gray-50"
      }`}
    >
      {showAnswers && <span aria-hidden="true">✓</span>}
      Show answers
    </button>
  );
}
