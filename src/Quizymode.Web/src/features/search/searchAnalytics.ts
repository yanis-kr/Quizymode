import { trackEvent } from "@/features/analytics/analyticsEvents";
import { getResultAnalyticsContext, type SearchRowData } from "./searchResultLinks";

const MAX_REPORTED_TOTAL = 500;

/**
 * One committed search (AC 11.13): a result click from the dropdown, or the /search page loading. `total` is how many
 * results were shown (zero is valid). The search text is never part of the payload.
 */
export function trackSearchPerformed(total: number): void {
  trackEvent({
    name: "search_performed",
    contextType: "search",
    total: Math.min(Math.max(0, Math.trunc(total)), MAX_REPORTED_TOTAL),
  });
}

/** A clicked result. Only public targets carry an id; the caller's own content is reported as `mine` with none. */
export function trackSearchResultClicked(row: SearchRowData, position: number): void {
  const context = getResultAnalyticsContext(row);
  trackEvent({
    name: "search_result_clicked",
    contextType: context.contextType,
    ...(context.contextId ? { contextId: context.contextId } : {}),
    position: Math.min(Math.max(1, Math.trunc(position)), MAX_REPORTED_TOTAL),
  });
}
