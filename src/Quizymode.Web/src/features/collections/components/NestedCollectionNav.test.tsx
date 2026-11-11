import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CollectionBreadcrumb } from "./CollectionBreadcrumb";
import { ChildCollectionsSection } from "./ChildCollectionsSection";

const ID_ROOT = "11111111-1111-4111-8111-111111111111";
const ID_MID = "22222222-2222-4222-8222-222222222222";

describe("CollectionBreadcrumb (#559)", () => {
  it("renders nothing at the top level", () => {
    const { container } = render(
      <MemoryRouter>
        <CollectionBreadcrumb trail={[]} currentName="Top" />
      </MemoryRouter>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the full trail with the current page marked aria-current", () => {
    render(
      <MemoryRouter>
        <CollectionBreadcrumb trail={[{ id: ID_ROOT, name: "Root" }, { id: ID_MID, name: "Middle" }]} currentName="Leaf" />
      </MemoryRouter>
    );
    const navs = screen.getAllByRole("navigation", { name: "Breadcrumb" });
    expect(navs).toHaveLength(2);
    const full = navs[0];
    expect(within(full).getByRole("link", { name: "Root" })).toHaveAttribute("href", expect.stringContaining(ID_ROOT));
    expect(within(full).getByRole("link", { name: "Middle" })).toHaveAttribute("href", expect.stringContaining(ID_MID));
    expect(within(full).getByText("Leaf")).toHaveAttribute("aria-current", "page");
  });

  it("collapses below sm to a back link to the parent", () => {
    render(
      <MemoryRouter>
        <CollectionBreadcrumb trail={[{ id: ID_ROOT, name: "Root" }, { id: ID_MID, name: "Middle" }]} currentName="Leaf" />
      </MemoryRouter>
    );
    const compact = screen.getAllByRole("navigation", { name: "Breadcrumb" })[1];
    expect(within(compact).getByRole("link", { name: "Middle" })).toHaveAttribute("href", expect.stringContaining(ID_MID));
    expect(within(compact).getByText("…")).toBeInTheDocument();
    expect(within(compact).getByText("Leaf")).toHaveAttribute("aria-current", "page");
  });
});

describe("ChildCollectionsSection (#559)", () => {
  it("renders nothing when there are no children and no hidden children", () => {
    const { container } = render(
      <MemoryRouter>
        <ChildCollectionsSection children={[]} hiddenCollectionCount={0} trailForChildren={[]} />
      </MemoryRouter>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("links each accessible child to its own page and counts hidden ones without naming them", () => {
    render(
      <MemoryRouter>
        <ChildCollectionsSection
          children={[{ id: ID_MID, name: "Middle", isPublic: true, hiddenFromOthers: false, addedAt: "2026-11-11T00:00:00Z" }]}
          hiddenCollectionCount={2}
          trailForChildren={[{ id: ID_ROOT, name: "Root" }]}
        />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: "Collections" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Middle" })).toHaveAttribute("href", expect.stringContaining(ID_MID));
    expect(screen.getByText("2 collections you cannot open are also here.")).toBeInTheDocument();
  });
});
