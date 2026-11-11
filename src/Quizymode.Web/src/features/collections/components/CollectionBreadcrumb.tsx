import { Link } from "react-router-dom";
import { buildCollectionPath } from "@/utils/collectionPath";

export interface CollectionTrailEntry {
  id: string;
  name: string;
}

interface CollectionBreadcrumbProps {
  /** Ancestors from the top collection down to the parent of the current page. */
  trail: CollectionTrailEntry[];
  currentName: string;
}

/**
 * Breadcrumb for a nested collection. Full trail from sm; below sm it collapses to
 * "… › Parent › Current" with a back link to the parent (AC 1.16 nested navigation, #559).
 */
export function CollectionBreadcrumb({ trail, currentName }: CollectionBreadcrumbProps) {
  if (trail.length === 0) return null;

  const parent = trail[trail.length - 1];
  const parentState = { trail: trail.slice(0, -1) };
  const separator = (
    <span aria-hidden="true" className="mx-1 text-slate-400">
      ›
    </span>
  );

  return (
    <>
      <nav aria-label="Breadcrumb" className="hidden min-w-0 flex-wrap items-center text-sm text-slate-600 sm:flex">
        {trail.map((entry, index) => (
          <span key={entry.id} className="inline-flex min-w-0 items-center">
            {index > 0 && separator}
            <Link
              to={buildCollectionPath(entry.id, entry.name)}
              state={{ trail: trail.slice(0, index) }}
              className="truncate hover:underline"
            >
              {entry.name}
            </Link>
          </span>
        ))}
        {separator}
        <span aria-current="page" className="truncate font-medium text-slate-800">
          {currentName}
        </span>
      </nav>

      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center text-sm text-slate-600 sm:hidden">
        {trail.length > 1 && <span aria-hidden="true" className="shrink-0">…</span>}
        {trail.length > 1 && separator}
        <Link
          to={buildCollectionPath(parent.id, parent.name)}
          state={parentState}
          className="min-w-0 truncate text-indigo-ink hover:underline"
        >
          {parent.name}
        </Link>
        {separator}
        <span aria-current="page" className="min-w-0 truncate font-medium text-slate-800">
          {currentName}
        </span>
      </nav>
    </>
  );
}

export default CollectionBreadcrumb;
