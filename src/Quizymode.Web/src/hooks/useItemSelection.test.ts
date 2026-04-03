import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useItemSelection from "./useItemSelection";

describe("useItemSelection", () => {
  it("starts with no items selected", () => {
    const { result } = renderHook(() => useItemSelection(["a", "b", "c"]));
    expect(result.current.selectedIds).toHaveLength(0);
    expect(result.current.selectedItemIds.size).toBe(0);
  });

  it("toggles item on when not selected", () => {
    const { result } = renderHook(() => useItemSelection(["a", "b", "c"]));

    act(() => {
      result.current.toggleItem("a");
    });

    expect(result.current.selectedItemIds.has("a")).toBe(true);
    expect(result.current.selectedIds).toContain("a");
  });

  it("toggles item off when already selected", () => {
    const { result } = renderHook(() => useItemSelection(["a", "b", "c"]));

    act(() => result.current.toggleItem("a"));
    act(() => result.current.toggleItem("a"));

    expect(result.current.selectedItemIds.has("a")).toBe(false);
  });

  it("selectAll selects all provided itemIds", () => {
    const { result } = renderHook(() => useItemSelection(["a", "b", "c"]));

    act(() => result.current.selectAll());

    expect(result.current.selectedIds).toHaveLength(3);
    expect(result.current.selectedItemIds.has("a")).toBe(true);
    expect(result.current.selectedItemIds.has("b")).toBe(true);
    expect(result.current.selectedItemIds.has("c")).toBe(true);
  });

  it("deselectAll clears all selections", () => {
    const { result } = renderHook(() => useItemSelection(["a", "b", "c"]));

    act(() => result.current.selectAll());
    act(() => result.current.deselectAll());

    expect(result.current.selectedIds).toHaveLength(0);
  });

  it("resets selection when resetKeys change", () => {
    let resetKey = 0;
    const { result, rerender } = renderHook(
      ({ key }) => useItemSelection(["a", "b"], [key]),
      { initialProps: { key: resetKey } }
    );

    act(() => result.current.selectAll());
    expect(result.current.selectedIds).toHaveLength(2);

    resetKey = 1;
    rerender({ key: resetKey });

    expect(result.current.selectedIds).toHaveLength(0);
  });

  it("does not reset selection when resetKeys remain the same", () => {
    const { result, rerender } = renderHook(
      ({ key }) => useItemSelection(["a", "b"], [key]),
      { initialProps: { key: 0 } }
    );

    act(() => result.current.selectAll());
    rerender({ key: 0 });

    expect(result.current.selectedIds).toHaveLength(2);
  });
});
