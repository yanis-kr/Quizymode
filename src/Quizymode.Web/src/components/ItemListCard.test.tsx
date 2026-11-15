import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ItemListCard from "./ItemListCard";
import type { ItemResponse } from "@/types/api";

vi.mock("@/api/ratings", () => ({
  ratingsApi: {
    getStats: vi.fn(),
  },
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQuery: vi.fn(() => ({ data: undefined })),
  };
});

vi.mock("@/components/SpeakButton", () => ({
  SpeakButton: () => null,
}));

vi.mock("@/hooks/useSpeech", () => ({
  useSpeech: () => ({ isSupported: false }),
}));

vi.mock("@/components/items/PronunciationHint", () => ({
  PronunciationHint: () => null,
}));

vi.mock("./ItemRatingsComments", () => ({
  default: () => null,
}));

function buildItem(overrides: Partial<ItemResponse> = {}): ItemResponse {
  return {
    id: "item-1",
    category: "languages",
    isPrivate: false,
    question: "What does '{{la|Carpe diem||}}' mean?",
    correctAnswer: "Seize the day",
    incorrectAnswers: ["Live for tomorrow"],
    explanation: "Horace made it famous as a push to act in the present.",
    createdAt: "2026-04-17T00:00:00Z",
    keywords: [],
    collections: [],
    ...overrides,
  };
}

describe("ItemListCard", () => {
  it("shows the picture review status line when the item has imageReview", () => {
    render(<ItemListCard item={buildItem({ imageReview: { state: "PendingReview", revision: 1 } })} showAnswer />);

    expect(screen.getByText("Pictures: Pending review")).toBeInTheDocument();
  });

  it("shows no picture review status without imageReview", () => {
    render(<ItemListCard item={buildItem()} showAnswer />);

    expect(screen.queryByText(/^Pictures:/)).not.toBeInTheDocument();
  });

  it("shows explanation when answers are visible", () => {
    render(<ItemListCard item={buildItem()} showAnswer />);

    expect(screen.getByText(/Answer:/)).toBeInTheDocument();
    expect(screen.getByText(/Explanation:/)).toBeInTheDocument();
    expect(screen.getByText(/Horace made it famous/)).toBeInTheDocument();
  });

  it("hides explanation when answers are hidden", () => {
    render(<ItemListCard item={buildItem()} showAnswer={false} />);

    expect(screen.queryByText(/Answer:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Explanation:/)).not.toBeInTheDocument();
  });

  it("shows the answer without a reveal button when showAnswer is unset", () => {
    render(<ItemListCard item={buildItem()} />);

    expect(screen.getByText(/Answer:/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show answer/i })).not.toBeInTheDocument();
  });

  it("keeps the answer out of the DOM and offers a Show answer button when hidden", () => {
    render(<ItemListCard item={buildItem()} showAnswer={false} onToggleReveal={vi.fn()} />);

    expect(screen.queryByText(/Seize the day/)).not.toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Show answer" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-controls", "answer-item-1");
    expect(button).toHaveAttribute("aria-describedby", "q-item-1");
    expect(document.getElementById("answer-item-1")).toBeEmptyDOMElement();
  });

  it("reveals the answer without a highlight and reads Hide answer when revealed", () => {
    const onToggle = vi.fn();
    render(<ItemListCard item={buildItem()} showAnswer={false} revealed onToggleReveal={onToggle} />);

    expect(screen.getByText(/Seize the day/)).toBeInTheDocument();
    expect(document.querySelector(".bg-green-100")).toBeNull();
    const button = screen.getByRole("button", { name: "Hide answer" });
    expect(button).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("hides the per-item button while the page toggle is on", () => {
    render(<ItemListCard item={buildItem()} showAnswer onToggleReveal={vi.fn()} />);

    expect(screen.getByText(/Seize the day/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show answer|hide answer/i })).not.toBeInTheDocument();
  });
});

describe("ItemListCard keyword chips (#664)", () => {
  it("AC 3.5.10 marks keywords selected case-insensitively with aria-pressed", () => {
    render(
      <ItemListCard
        item={buildItem({
          keywords: [
            { id: "k1", name: "funny", isPrivate: false },
            { id: "k2", name: "idioms", isPrivate: false },
          ] as ItemResponse["keywords"],
        })}
        onKeywordClick={vi.fn()}
        selectedKeywords={["Funny"]}
        showAnswer
      />
    );

    expect(screen.getByRole("button", { name: "funny" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "idioms" })).toHaveAttribute("aria-pressed", "false");
  });
});
