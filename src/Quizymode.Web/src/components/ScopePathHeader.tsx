import type { ReactNode } from "react";

interface ScopePathHeaderProps {
  breadcrumb: ReactNode;
  count?: number | null;
  hint?: string;
  endSlot?: ReactNode;
  className?: string;
}

export function ScopePathHeader({
  breadcrumb,
  count,
  hint,
  endSlot,
  className = "",
}: ScopePathHeaderProps) {
  const showCount = typeof count === "number";

  return (
    <div className={`mt-2 mb-6 space-y-2 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {breadcrumb}
          {showCount && (
            <span className="text-sm text-gray-600" aria-label="Item count">
              ({count})
            </span>
          )}
        </div>
        {endSlot ? (
          <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
            {endSlot}
          </div>
        ) : null}
      </div>
      {hint ? <p className="text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}
