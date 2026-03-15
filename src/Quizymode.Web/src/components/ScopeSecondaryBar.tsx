/**
 * Secondary bar for scope screens: compact active collection + mode switcher (Sets|List|Explore|Quiz).
 * Rendered by scope pages (categories, collection, explore, quiz, my-items) below the main nav.
 */
import type { ReactNode } from "react";
import { useState } from "react";
import { FolderIcon, Cog6ToothIcon } from "@heroicons/react/24/outline";
import { useActiveCollection } from "@/hooks/useActiveCollection";
import { ModeSwitcher, type ViewMode } from "@/components/ModeSwitcher";
import ItemCollectionsModal from "./ItemCollectionsModal";

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

/** Compact active collection label: first 3 chars of name or "Set" when none */
function CompactActiveCollection() {
  const { activeCollection, activeCollectionId } = useActiveCollection();
  const [showModal, setShowModal] = useState(false);
  const label = activeCollectionId && activeCollection
    ? activeCollection.name.slice(0, 3)
    : "Set";

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors border border-gray-200"
        title={activeCollection ? `Active: ${activeCollection.name} (click to change)` : "Set active collection"}
      >
        <FolderIcon className="h-4 w-4 text-gray-500" />
        <span className="font-medium">{label}</span>
        <Cog6ToothIcon className="h-3.5 w-3.5 text-gray-500" />
      </button>
      <ItemCollectionsModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
      />
    </>
  );
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
      <CompactActiveCollection />
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
