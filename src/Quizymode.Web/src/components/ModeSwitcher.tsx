/**
 * Shared mode tabs for study/browse screens: Sets | List | Explore | Quiz.
 * Visibility: show Sets only when scope has child buckets; show Explore/Quiz only when scope has items.
 */
import {
  Squares2X2Icon,
  ListBulletIcon,
  MagnifyingGlassIcon,
  AcademicCapIcon,
} from "@heroicons/react/24/outline";

export type ViewMode = "sets" | "list" | "explore" | "quiz";

export interface ModeSwitcherProps {
  /** Which modes to show. Omit "sets" when no child buckets; omit "explore"/"quiz" when no items. */
  availableModes: ViewMode[];
  activeMode: ViewMode;
  onChange: (mode: ViewMode) => void;
  /** Optional class for the container */
  className?: string;
}

export function ModeSwitcher({
  availableModes,
  activeMode,
  onChange,
  className = "",
}: ModeSwitcherProps) {
  const baseClass =
    "inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors";
  const activeClass = "bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200";
  const inactiveClass =
    "text-gray-600 hover:bg-gray-100 hover:text-gray-900";

  const modes: { mode: ViewMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { mode: "sets", label: "Sets", icon: Squares2X2Icon },
    { mode: "list", label: "List", icon: ListBulletIcon },
    { mode: "explore", label: "Explore", icon: MagnifyingGlassIcon },
    { mode: "quiz", label: "Quiz", icon: AcademicCapIcon },
  ];

  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${className}`}
      role="tablist"
      aria-label="View mode"
    >
      {modes
        .filter((m) => availableModes.includes(m.mode))
        .map(({ mode, label, icon: Icon }) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={activeMode === mode}
            onClick={() => onChange(mode)}
            className={`${baseClass} ${
              activeMode === mode ? activeClass : inactiveClass
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
    </div>
  );
}
