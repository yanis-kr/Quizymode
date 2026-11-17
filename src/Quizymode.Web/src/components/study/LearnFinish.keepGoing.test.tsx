import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LearnFinish } from "./LearnFinish";

vi.mock("@/features/auth/components/SignupPrompt", () => ({ SignupPrompt: () => null }));

const base = {
  total: 5,
  firstTryCorrect: 4,
  firstTryPercentage: 80,
  missedCount: 1,
  isAuthenticated: false,
  browsePath: "/categories/exams",
  browseLabel: "Browse",
  saveState: "idle" as const,
  onLearnAgain: vi.fn(),
  onRetrySave: vi.fn(),
};

describe("LearnFinish Keep going block (#711, AC2)", () => {
  it("renders the Keep going block passed by the Learn page", () => {
    render(
      <MemoryRouter>
        <LearnFinish {...base} keepGoing={<div data-testid="keep-going">Keep going tiles</div>} />
      </MemoryRouter>
    );
    expect(screen.getByTestId("keep-going")).toBeInTheDocument();
  });

  it("renders nothing extra when no Keep going block is passed (collections)", () => {
    render(
      <MemoryRouter>
        <LearnFinish {...base} />
      </MemoryRouter>
    );
    expect(screen.queryByTestId("keep-going")).toBeNull();
  });
});
