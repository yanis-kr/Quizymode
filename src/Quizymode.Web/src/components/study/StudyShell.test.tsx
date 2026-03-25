import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { StudyShell } from "./StudyShell";

vi.mock("@/components/ItemRatingsComments", () => ({
  default: () => <div>Ratings</div>,
}));

vi.mock("@/components/ItemCollectionControls", () => ({
  ItemCollectionControls: () => <div>Collections</div>,
}));

const item = {
  id: "item-1",
  category: "science",
  isPrivate: false,
  question: "Question",
  correctAnswer: "Answer",
  incorrectAnswers: ["A", "B", "C"],
  explanation: "Explanation",
  createdAt: "2026-03-22T00:00:00Z",
  keywords: [],
  collections: [],
};

describe("StudyShell", () => {
  it("shows a compact hint without rendering a large title when title is omitted", () => {
    render(
      <MemoryRouter>
        <StudyShell
          description="Flashcards-style study mode for reviewing quiz items."
          currentIndex={0}
          totalCount={3}
          onPrev={() => {}}
          onNext={() => {}}
          isPrevDisabled={true}
          isNextDisabled={false}
          currentItem={item}
          onOpenComments={() => {}}
          onOpenManageCollections={() => {}}
          isAuthenticated={false}
        >
          <div>Body</div>
        </StudyShell>
      </MemoryRouter>
    );

    expect(
      screen.getByText(/Flashcards-style study mode for reviewing quiz items/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /Flashcards Mode/i })
    ).not.toBeInTheDocument();
  });
});
