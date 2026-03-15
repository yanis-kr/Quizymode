/**
 * Reusable grid of bucket cards (category or keyword sets). Click opens the bucket.
 * Mode switching is handled at page level via ModeSwitcher.
 */
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";

export interface BucketItem {
  id: string;
  label: string;
  itemCount: number;
  description?: string | null;
  averageRating?: number | null;
  /** Show "Private" (purple) badge when true (e.g. category/collection). */
  isPrivate?: boolean;
  /** Show "Private" (yellow) badge when > 0 (e.g. keyword set has private items). */
  privateItemCount?: number;
}

export interface BucketGridViewProps {
  buckets: BucketItem[];
  onOpenBucket: (bucket: BucketItem) => void;
  className?: string;
}

export function BucketGridView({
  buckets,
  onOpenBucket,
  className = "",
}: BucketGridViewProps) {
  return (
    <div
      className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${className}`}
    >
      {buckets.map((bucket) => (
        <div
          key={bucket.id}
          role="button"
          tabIndex={0}
          onClick={() => onOpenBucket(bucket)}
          onKeyDown={(e) => e.key === "Enter" && onOpenBucket(bucket)}
          className="bg-white overflow-hidden shadow rounded-lg hover:shadow-lg transition-shadow p-6 text-left cursor-pointer"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-medium text-gray-900">{bucket.label}</h3>
                {bucket.isPrivate === true && (
                  <span className="px-2 py-1 text-xs font-medium rounded bg-purple-100 text-purple-800">
                    Private
                  </span>
                )}
                {bucket.privateItemCount != null && bucket.privateItemCount > 0 && (
                  <span className="px-2 py-1 text-xs font-medium rounded bg-amber-100 text-amber-800">
                    Private
                  </span>
                )}
              </div>
              {bucket.description ? (
                <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                  {bucket.description}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col items-end gap-0.5 flex-shrink-0 text-sm text-gray-500">
              <span>{bucket.itemCount} items</span>
              {bucket.averageRating != null && (
                <div className="flex items-center gap-1 text-gray-600">
                  <StarIconSolid className="h-4 w-4 text-yellow-400" />
                  <span className="font-medium">
                    {bucket.averageRating.toFixed(1)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
