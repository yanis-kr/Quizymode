import { beforeEach, describe, expect, it, vi } from "vitest";
import { trackSearchPerformed, trackSearchResultClicked } from "./searchAnalytics";

const { mockTrackEvent } = vi.hoisted(() => ({ mockTrackEvent: vi.fn() }));

vi.mock("@/features/analytics/analyticsEvents", () => ({ trackEvent: mockTrackEvent }));

describe("search analytics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("search_performed carries only the result total, which may be zero", () => {
    trackSearchPerformed(0);
    trackSearchPerformed(9000);
    expect(mockTrackEvent).toHaveBeenNthCalledWith(1, { name: "search_performed", contextType: "search", total: 0 });
    expect(mockTrackEvent).toHaveBeenNthCalledWith(2, { name: "search_performed", contextType: "search", total: 500 });
  });

  it("search_result_clicked sends contextId for a public target only", () => {
    trackSearchResultClicked(
      { type: "collection", value: { id: "abc", name: "Public set", description: null, itemCount: 1 } },
      2
    );
    trackSearchResultClicked({ type: "mine", value: { kind: "item", id: "private-id", title: "Private question" } }, 1);

    expect(mockTrackEvent).toHaveBeenNthCalledWith(1, {
      name: "search_result_clicked",
      contextType: "collection",
      contextId: "abc",
      position: 2,
    });
    const mineCall = mockTrackEvent.mock.calls[1][0] as Record<string, unknown>;
    expect(mineCall).toEqual({ name: "search_result_clicked", contextType: "mine", position: 1 });
    expect(JSON.stringify(mineCall)).not.toContain("private");
  });
});
