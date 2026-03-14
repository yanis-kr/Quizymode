import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModeSwitcher } from "./ModeSwitcher";

describe("ModeSwitcher", () => {
  it("renders only available modes", () => {
    render(
      <ModeSwitcher
        availableModes={["list", "explore"]}
        activeMode="list"
        onChange={() => {}}
      />
    );
    expect(screen.getByRole("tab", { name: /list/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /explore/i })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /sets/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /quiz/i })).not.toBeInTheDocument();
  });

  it("renders all four modes when all available", () => {
    render(
      <ModeSwitcher
        availableModes={["sets", "list", "explore", "quiz"]}
        activeMode="sets"
        onChange={() => {}}
      />
    );
    expect(screen.getByRole("tab", { name: /sets/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /list/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /explore/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /quiz/i })).toBeInTheDocument();
  });

  it("marks active mode with aria-selected", () => {
    render(
      <ModeSwitcher
        availableModes={["list", "explore", "quiz"]}
        activeMode="explore"
        onChange={() => {}}
      />
    );
    const exploreTab = screen.getByRole("tab", { name: /explore/i });
    expect(exploreTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /list/i })).toHaveAttribute(
      "aria-selected",
      "false"
    );
  });

  it("calls onChange when a mode tab is clicked", async () => {
    const user = userEvent.setup({ delay: null });
    const onChange = vi.fn();
    render(
      <ModeSwitcher
        availableModes={["list", "explore", "quiz"]}
        activeMode="list"
        onChange={onChange}
      />
    );
    await user.click(screen.getByRole("tab", { name: /quiz/i }));
    expect(onChange).toHaveBeenCalledWith("quiz");
  });

  it("has accessible tablist", () => {
    render(
      <ModeSwitcher
        availableModes={["list"]}
        activeMode="list"
        onChange={() => {}}
      />
    );
    expect(screen.getByRole("tablist", { name: /view mode/i })).toBeInTheDocument();
  });
});
