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

  it("passes the current quiz URL to item details so the user can return to the same card", () => {
    render(
      <MemoryRouter initialEntries={["/quiz/collections/collection-1/sample+collection/item/item-1?keywords=space"]}>
        <StudyShell
          currentIndex={0}
          totalCount={3}
          onPrev={() => {}}
          onNext={() => {}}
          isPrevDisabled={true}
          isNextDisabled={false}
          currentItem={item}
          navigationContext={{
            mode: "quiz",
            collectionId: "collection-1",
            currentIndex: 0,
            itemIds: ["item-1"],
          }}
          onOpenComments={() => {}}
          onOpenManageCollections={() => {}}
          isAuthenticated={false}
        >
          <div>Body</div>
        </StudyShell>
      </MemoryRouter>
    );

    expect(screen.getByTitle(/view item details/i)).toHaveAttribute(
      "href",
      "/items/item-1?return=%2Fquiz%2Fcollections%2Fcollection-1%2Fsample%2Bcollection%2Fitem%2Fitem-1%3Fkeywords%3Dspace&returnMode=quiz"
    );
  });

  it("labels Next as Finish on the button and the chevron, and shows the round label", () => {
    render(
      <MemoryRouter>
        <StudyShell
          currentIndex={1}
          totalCount={2}
          onPrev={() => {}}
          onNext={() => {}}
          nextLabel="Finish"
          roundLabel="Still learning"
          isPrevDisabled={false}
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

    expect(screen.getAllByRole("button", { name: "Finish" })).toHaveLength(2);
    expect(screen.getByTitle("Finish")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(screen.getByLabelText("2 of 2, Still learning round")).toHaveTextContent("2 of 2");
    expect(screen.getByText("Still learning")).toBeInTheDocument();
  });
});
