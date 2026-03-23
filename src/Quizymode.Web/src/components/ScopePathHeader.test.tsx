import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScopePathHeader } from "./ScopePathHeader";

describe("ScopePathHeader", () => {
  it("renders breadcrumb, count, hint, and end slot", () => {
    render(
      <ScopePathHeader
        breadcrumb={<nav>Categories &gt; exams &gt; act &gt; math</nav>}
        count={3}
        hint="Flashcards-style study mode for reviewing quiz items."
        endSlot={<button type="button">Sort</button>}
      />
    );

    expect(
      screen.getByText("Categories > exams > act > math")
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/item count/i)).toHaveTextContent("(3)");
    expect(
      screen.getByText(/Flashcards-style study mode for reviewing quiz items/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sort" })).toBeInTheDocument();
  });
});
