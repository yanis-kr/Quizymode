import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
          { value: "count", label: "Question count" },
        ]}
      />
    );

    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("flex-wrap");
  });

  it("renders the Show answers toggle with a stable label, aria-pressed and a 44px target", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <FilterControlBar hasActiveFilters={false} onOpenFilters={() => {}} showAnswers={false} onToggleShowAnswers={onToggle} />
    );

    const toggle = screen.getByRole("button", { name: "Show answers" });
    expect(toggle).toHaveAttribute("type", "button");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(toggle.className).toContain("min-h-[44px]");
    expect(toggle.querySelector("svg")).toBeNull();
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(
      <FilterControlBar hasActiveFilters={false} onOpenFilters={() => {}} showAnswers onToggleShowAnswers={onToggle} />
    );
    const pressed = screen.getByRole("button", { name: /show answers/i });
    expect(pressed).toHaveAttribute("aria-pressed", "true");
    expect(pressed).toHaveTextContent("✓");
  });

  it("disables the toggle while the saved setting loads", () => {
    render(
      <FilterControlBar
        hasActiveFilters={false}
        onOpenFilters={() => {}}
        showAnswers={false}
        onToggleShowAnswers={() => {}}
        showAnswersDisabled
      />
    );

    expect(screen.getByRole("button", { name: "Show answers" })).toBeDisabled();
  });

  it("titles Listen All for questions only while answers are hidden", () => {
    const { rerender } = render(
      <FilterControlBar
        hasActiveFilters={false}
        onOpenFilters={() => {}}
        showAnswers={false}
        onToggleShowAnswers={() => {}}
        listenAllState="idle"
        onListenAll={() => {}}
      />
    );
    expect(screen.getByTitle("Listen to all questions (answers hidden)")).toBeInTheDocument();

    rerender(
      <FilterControlBar
        hasActiveFilters={false}
        onOpenFilters={() => {}}
        showAnswers
        onToggleShowAnswers={() => {}}
        listenAllState="idle"
        onListenAll={() => {}}
      />
    );
    expect(screen.getByTitle("Listen to all questions (TTS)")).toBeInTheDocument();
  });
});
