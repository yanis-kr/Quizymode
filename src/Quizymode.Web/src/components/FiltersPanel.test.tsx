import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FiltersPanel } from "./FiltersPanel";

describe("FiltersPanel", () => {
  it("renders search input when showSearch is true", () => {
    render(
      <FiltersPanel
        config={{ showSearch: true }}
        values={{}}
        onChange={() => {}}
      />
    );
    expect(screen.getByPlaceholderText(/search questions/i)).toBeInTheDocument();
  });

  it("does not render search when showSearch is false", () => {
    render(
      <FiltersPanel
        config={{ showSearch: false }}
        values={{}}
        onChange={() => {}}
      />
    );
    expect(screen.queryByPlaceholderText(/search questions/i)).not.toBeInTheDocument();
  });

  it("renders category select when showCategory is true and categories provided", () => {
    render(
      <FiltersPanel
        config={{ showCategory: true }}
        values={{}}
        onChange={() => {}}
        categories={[{ category: "Math" }, { category: "Science" }]}
      />
    );
    expect(screen.getByRole("combobox", { name: /category/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Math" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Science" })).toBeInTheDocument();
  });

  it("renders rating select when showRating is true", () => {
    render(
      <FiltersPanel
        config={{ showRating: true }}
        values={{ rating: "all" }}
        onChange={() => {}}
      />
    );
    expect(screen.getByLabelText(/rating/i)).toBeInTheDocument();
  });

  it("calls onChange when search input changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FiltersPanel
        config={{ showSearch: true }}
        values={{ search: "" }}
        onChange={onChange}
      />
    );
    await user.type(screen.getByPlaceholderText(/search questions/i), "test");
    expect(onChange).toHaveBeenCalledWith("search", "t");
    expect(onChange).toHaveBeenCalledWith("search", "e");
    expect(onChange).toHaveBeenCalledWith("search", "s");
    expect(onChange).toHaveBeenCalledWith("search", "t");
  });

  it("renders visibility select when showVisibility is true", () => {
    render(
      <FiltersPanel
        config={{ showVisibility: true }}
        values={{ visibility: "all" }}
        onChange={() => {}}
      />
    );
    expect(screen.getByLabelText(/visibility/i)).toBeInTheDocument();
  });
});
