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
    expect(screen.getByRole("tab", { name: /flashcards/i })).toBeInTheDocument();
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
    expect(screen.getByRole("tab", { name: /flashcards/i })).toBeInTheDocument();
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
    const exploreTab = screen.getByRole("tab", { name: /flashcards/i });
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

  describe("mobile single-row layout", () => {
    it("container does not have flex-wrap so buttons cannot wrap to a second row", () => {
      const { container } = render(
        <ModeSwitcher
          availableModes={["sets", "list", "explore", "quiz"]}
          activeMode="sets"
          onChange={() => {}}
        />
      );
      const tablist = container.firstChild as HTMLElement;
      expect(tablist.className).toContain("flex");
      expect(tablist.className).not.toMatch(/\bflex-wrap\b/);
    });

    it("container has overflow-x-auto so buttons scroll rather than wrap on very narrow screens", () => {
      const { container } = render(
        <ModeSwitcher
          availableModes={["sets", "list", "explore", "quiz"]}
          activeMode="sets"
          onChange={() => {}}
        />
      );
      const tablist = container.firstChild as HTMLElement;
      expect(tablist.className).toContain("overflow-x-auto");
    });

    it("every button has whitespace-nowrap so button labels never break across lines", () => {
      render(
        <ModeSwitcher
          availableModes={["sets", "list", "explore", "quiz"]}
          activeMode="list"
          onChange={() => {}}
        />
      );
      const tabs = screen.getAllByRole("tab");
      for (const tab of tabs) {
        expect(tab.className).toContain("whitespace-nowrap");
      }
    });

    it("all four mode buttons are siblings in the same flex row (not nested in sub-containers)", () => {
      const { container } = render(
        <ModeSwitcher
          availableModes={["sets", "list", "explore", "quiz"]}
          activeMode="quiz"
          onChange={() => {}}
        />
      );
      const tablist = container.firstChild as HTMLElement;
      // Direct children of the tablist are the buttons themselves
      const directButtonChildren = Array.from(tablist.children).filter(
        (el) => el.getAttribute("role") === "tab"
      );
      expect(directButtonChildren).toHaveLength(4);
    });
  });

  it("shows Learn after Quiz when available", () => {
    render(
      <ModeSwitcher
        availableModes={["sets", "list", "explore", "quiz", "learn"]}
        activeMode="learn"
        onChange={() => {}}
      />
    );
    const labels = screen.getAllByRole("tab").map((tab) => tab.textContent);
    expect(labels).toEqual(["Sets", "List", "Flashcards", "Quiz", "Learn"]);
    expect(screen.getByRole("tab", { name: "Learn" })).toHaveAttribute("aria-selected", "true");
  });

  it("shows Games after Learn when available", () => {
    render(
      <ModeSwitcher
        availableModes={["sets", "list", "explore", "quiz", "learn", "games"]}
        activeMode="games"
        onChange={() => {}}
      />
    );
    const labels = screen.getAllByRole("tab").map((tab) => tab.textContent);
    expect(labels).toEqual(["Sets", "List", "Flashcards", "Quiz", "Learn", "Games"]);
    expect(screen.getByRole("tab", { name: "Games" })).toHaveAttribute("aria-selected", "true");
  });

  it("scrolls the active tab into view and shows an edge cue only while tabs overflow", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const widths = vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(400);
    const client = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(300);

    const { unmount } = render(
      <ModeSwitcher
        availableModes={["sets", "list", "explore", "quiz", "learn"]}
        activeMode="learn"
        onChange={() => {}}
      />
    );

    expect(scrollIntoView).toHaveBeenCalledWith({ inline: "nearest", block: "nearest" });
    expect(screen.getByTestId("mode-switcher-edge-cue")).toBeInTheDocument();
    unmount();

    client.mockReturnValue(400);
    render(
      <ModeSwitcher availableModes={["list", "explore", "quiz", "learn"]} activeMode="list" onChange={() => {}} />
    );
    expect(screen.queryByTestId("mode-switcher-edge-cue")).toBeNull();
    widths.mockRestore();
    client.mockRestore();
  });
});
