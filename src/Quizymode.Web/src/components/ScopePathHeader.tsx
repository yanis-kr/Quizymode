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
    <div className={`mt-1 mb-3 space-y-1 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto">
          {breadcrumb}
          {showCount && (
            <span className="text-xs text-gray-500 whitespace-nowrap flex-shrink-0" aria-label="Item count">
              ({count})
            </span>
          )}
        </div>
        {endSlot ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            {endSlot}
          </div>
        ) : null}
      </div>
      {hint ? <p className="text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}
