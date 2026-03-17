/**
 * Secondary bar for scope screens: mode switcher (Sets|List Items|Flashcards|Quiz).
 * Rendered by scope pages (categories, collection, explore, quiz, my-items) below the main nav.
 */
import type { ReactNode } from "react";
import { ModeSwitcher, type ViewMode } from "@/components/ModeSwitcher";

export type ScopeType = "category" | "collection" | "my-items";

export interface ScopeSecondaryBarProps {
  scopeType: ScopeType;
  activeMode: ViewMode;
  availableModes: ViewMode[];
  onModeChange: (mode: ViewMode) => void;
  /** Optional slot for filter toggle / filter summary (e.g. when activeMode === "list") */
  filterSlot?: ReactNode;
  className?: string;
}

export function ScopeSecondaryBar({
  scopeType,
  activeMode,
  availableModes,
  onModeChange,
  filterSlot,
  className = "",
}: ScopeSecondaryBarProps) {
  return (
    <div
      className={`flex flex-wrap items-center gap-3 py-3 px-4 bg-white border-b border-gray-200 ${className}`}
      role="region"
      aria-label={`Scope toolbar: ${scopeType}`}
    >
      {availableModes.length > 0 && (
        <ModeSwitcher
          availableModes={availableModes}
          activeMode={activeMode}
          onChange={onModeChange}
        />
      )}
      {filterSlot != null && <div className="flex-1 flex items-center justify-end min-w-0">{filterSlot}</div>}
    </div>
  );
}
