import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ExploreNextTiles, type ExploreNextTile } from "./ExploreNextTiles";

const tile = (id: string, label: string): ExploreNextTile => ({ id, label, copy: "5 questions", cta: "Play 5", to: `/quiz/${id}?size=5` });

const renderTiles = (props: Partial<React.ComponentProps<typeof ExploreNextTiles>>) =>
  render(
    <MemoryRouter>
      <ExploreNextTiles heading="Explore next" tiles={[]} {...props} />
    </MemoryRouter>,
  );

describe("ExploreNextTiles", () => {
  it("renders the heading it is given and one link per tile, with only the tiles it has (no padding)", () => {
    renderTiles({ heading: "Try something else", tiles: [tile("a", "Alpha"), tile("b", "Beta")] });
    expect(screen.getByRole("heading", { name: "Try something else" })).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /Alpha/ })).toHaveAttribute("href", "/quiz/a?size=5");
  });

  it("reports the 1-based position and id of the followed tile", () => {
    const onSelect = vi.fn();
    renderTiles({ tiles: [tile("a", "Alpha"), tile("b", "Beta")], onSelect });
    fireEvent.click(screen.getByRole("link", { name: /Beta/ }));
    expect(onSelect).toHaveBeenCalledWith(2, "b");
  });

  it("shows three skeletons while loading and marks the block busy", () => {
    const { container } = renderTiles({ loading: true });
    expect(screen.getAllByTestId("explore-next-skeleton")).toHaveLength(3);
    expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
  });

  it("renders nothing with no tiles and nothing loading", () => {
    const { container } = renderTiles({});
    expect(container).toBeEmptyDOMElement();
  });
});
