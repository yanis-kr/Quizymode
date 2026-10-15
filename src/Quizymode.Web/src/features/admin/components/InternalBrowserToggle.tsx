import { useState } from "react";
import { isInternalBrowser, setInternalBrowser } from "@/utils/pageViewTracking";

/**
 * Lets an admin mark the current browser as internal so its visits, including
 * signed-out ones, are excluded from analytics reports.
 */
const InternalBrowserToggle = () => {
  const [isExcluded, setIsExcluded] = useState(() => isInternalBrowser());

  return (
    <label className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <input
        type="checkbox"
        checked={isExcluded}
        onChange={(event) => {
          setInternalBrowser(event.target.checked);
          setIsExcluded(isInternalBrowser());
        }}
        className="mt-0.5 h-4 w-4 rounded border-amber-300"
      />
      <span>
        <span className="font-medium">Exclude this browser from analytics</span>
        <span className="block text-xs text-amber-800">
          Visits from this device count as internal traffic, even when signed out.
        </span>
      </span>
    </label>
  );
};

export default InternalBrowserToggle;
