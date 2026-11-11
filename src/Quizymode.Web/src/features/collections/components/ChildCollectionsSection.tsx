import { Link } from "react-router-dom";
import { buildCollectionPath } from "@/utils/collectionPath";
import type { ChildCollection } from "@/api/collections";
import type { CollectionTrailEntry } from "./CollectionBreadcrumb";

interface ChildCollectionsSectionProps {
  children: ChildCollection[];
  hiddenCollectionCount: number;
  /** Trail the child page receives so its breadcrumb can show the path down. */
  trailForChildren: CollectionTrailEntry[];
}

/**
 * Lists the nested collections a collection contains. Each opens as its own page (drill-down),
 * not as an indented tree. Inaccessible children are only counted, never named (#554).
 */
export function ChildCollectionsSection({ children, hiddenCollectionCount, trailForChildren }: ChildCollectionsSectionProps) {
  if (children.length === 0 && hiddenCollectionCount === 0) return null;

  return (
    <section aria-labelledby="child-collections-heading" className="rounded-[24px] border border-slate-200/80 bg-surface/90 p-4 shadow-sm shadow-slate-300/20">
      <h2 id="child-collections-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Collections
      </h2>
      {children.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-200/80">
          {children.map((child) => (
            <li key={child.id} className="min-w-0 py-2">
              <Link
                to={buildCollectionPath(child.id, child.name)}
                state={{ trail: trailForChildren }}
                className="block truncate font-medium text-indigo-ink hover:underline"
              >
                {child.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {hiddenCollectionCount > 0 && (
        <p className="mt-2 text-sm text-slate-500">
          {hiddenCollectionCount === 1 ? "1 collection you cannot open is also here." : `${hiddenCollectionCount} collections you cannot open are also here.`}
        </p>
      )}
    </section>
  );
}

export default ChildCollectionsSection;
