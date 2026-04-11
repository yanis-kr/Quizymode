import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FilterControlBar } from "./FilterControlBar";

describe("FilterControlBar", () => {
  it("renders the middle action between Filters and Map", () => {
    render(
      <FilterControlBar
        hasActiveFilters={false}
        onOpenFilters={() => {}}
        middleSlot={
          <button type="button">
            Add
          </button>
        }
        onOpenMap={() => {}}
      />
    );

    const filtersButton = screen.getByRole("button", { name: /filters/i });
    const addButton = screen.getByRole("button", { name: "Add" });
    const mapButton = screen.getByRole("button", { name: "Map" });

    expect(
      filtersButton.compareDocumentPosition(addButton) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      addButton.compareDocumentPosition(mapButton) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("keeps a wrapping layout so sort controls can move without overflowing", () => {
    const { container } = render(
      <FilterControlBar
        hasActiveFilters={true}
        activeFilterCount={2}
        onOpenFilters={() => {}}
        onOpenMap={() => {}}
        sortBy="name"
        onSortChange={() => {}}
        sortOptions={[
          { value: "name", label: "Name" },
          { value: "count", label: "Item count" },
        ]}
      />
    );

    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("flex-wrap");
  });
});
