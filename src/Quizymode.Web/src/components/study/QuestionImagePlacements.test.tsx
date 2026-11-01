import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { QuizRenderer } from "./QuizRenderer";
import { ExploreRenderer } from "./ExploreRenderer";
import { LearnQuestion } from "./LearnQuestion";
import { LearnRecap } from "./LearnRecap";
import ItemListCard from "@/components/ItemListCard";
import ReviewBoardPage from "@/features/admin/pages/ReviewBoardPage";
import { CollectionPrintView } from "@/features/collections/components/CollectionPrintView";
import { adminApi } from "@/api/admin";
import type { ItemResponse } from "@/types/api";

vi.mock("@/media/curatedImages", () => ({
  resolveCuratedImage: (key: string) => (key === "curated:flags/fr" ? "/assets/m/fr.webp" : null),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: true, isAdmin: true }),
}));
vi.mock("@/api/admin", () => ({
  adminApi: { getReviewBoardItems: vi.fn(), approveItem: vi.fn(), rejectItem: vi.fn() },
}));
vi.mock("@/api/ratings", () => ({ ratingsApi: { getStats: vi.fn().mockResolvedValue(null) } }));

const questionImage = { key: "curated:flags/fr", altText: "Three vertical bands: blue, white, red" };

const pictureItem: ItemResponse = {
  id: "flag-1",
  category: "geography",
  isPrivate: false,
  question: "Which country uses this flag?",
  correctAnswer: "France",
  incorrectAnswers: ["Italy", "Ireland", "Romania"],
  explanation: "The tricolore.",
  createdAt: "2026-01-01T00:00:00Z",
  keywords: [],
  collections: [],
  questionImage,
};

const textItem: ItemResponse = { ...pictureItem, id: "text-1", question: "Capital of France?", questionImage: null };

const options = ["Italy", "France", "Ireland", "Romania"];

function quiz(item: ItemResponse, showAnswer: boolean, onAnswerSelect = vi.fn()) {
  return (
    <QuizRenderer
      item={item}
      options={options}
      selectedAnswer={showAnswer ? "France" : null}
      showAnswer={showAnswer}
      onAnswerSelect={onAnswerSelect}
      stats={{ total: 0, correct: 0 }}
    />
  );
}

describe("QuizRenderer picture", () => {
  it("shows the picture with its alt text, before and after the answer is revealed", () => {
    const { rerender } = render(quiz(pictureItem, false));
    expect(screen.getByAltText(questionImage.altText)).toBeInTheDocument();

    rerender(quiz(pictureItem, true));
    expect(screen.getByAltText(questionImage.altText)).toBeInTheDocument();
  });

  it("renders no picture for a text-only item", () => {
    render(quiz(textItem, false));
    expect(screen.queryByTestId("question-image")).not.toBeInTheDocument();
  });

  it("keeps answers selectable when the picture fails to load", async () => {
    const onAnswerSelect = vi.fn();
    const user = userEvent.setup({ delay: null });
    render(quiz(pictureItem, false, onAnswerSelect));
    fireEvent.error(screen.getByAltText(questionImage.altText));
    expect(screen.getByText("Picture couldn't load")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /France/ }));

    expect(onAnswerSelect).toHaveBeenCalledWith("France");
  });
});

describe("ExploreRenderer picture", () => {
  it("keeps the picture outside the flip buttons so its alt text stays reachable", () => {
    render(<ExploreRenderer item={pictureItem} />);
    const img = screen.getByAltText(questionImage.altText);
    expect(img.closest("button")).toBeNull();
    const flip = screen.getByRole("button", { name: "Show answer and explanation" });
    expect(within(flip).queryByRole("img")).toBeNull();
  });

  it("keeps the picture visible after flipping", async () => {
    const user = userEvent.setup();
    render(<ExploreRenderer item={pictureItem} />);
    await user.click(screen.getByRole("button", { name: "Show answer and explanation" }));
    expect(screen.getAllByAltText(questionImage.altText)).toHaveLength(1);
  });

  it("renders no picture slot for a text-only item", () => {
    render(<ExploreRenderer item={textItem} />);
    expect(screen.queryByTestId("question-image")).not.toBeInTheDocument();
  });
});

describe("LearnQuestion picture", () => {
  it("shows the picture under the question", () => {
    render(
      <LearnQuestion
        item={pictureItem}
        options={options}
        selectedAnswer={null}
        showAnswer={false}
        onAnswerSelect={vi.fn()}
      />,
    );
    expect(screen.getByAltText(questionImage.altText)).toBeInTheDocument();
  });
});

describe("LearnRecap thumbnail", () => {
  it("shows a small thumbnail for picture rows only", () => {
    render(
      <LearnRecap
        roundNumber={1}
        rows={[
          { itemId: "a", question: "Flag?", questionImage, status: "mastered" },
          { itemId: "b", question: "Capital?", status: "missed" },
        ]}
        mastered={1}
        total={2}
        onContinue={vi.fn()}
        onStartOver={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId("question-image")).toHaveLength(1);
    expect(screen.getByAltText(questionImage.altText)).toHaveAttribute("loading", "lazy");
  });
});

describe("ItemListCard thumbnail", () => {
  it("shows a thumbnail when the item has a picture", () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ItemListCard item={pictureItem} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByAltText(questionImage.altText)).toHaveAttribute("loading", "lazy");
  });
});

describe("ReviewBoardPage thumbnail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a thumbnail for picture items", async () => {
    vi.mocked(adminApi.getReviewBoardItems).mockResolvedValue({
      items: [
        {
          id: "i1",
          category: "geography",
          isPrivate: true,
          question: "Which country uses this flag?",
          correctAnswer: "France",
          incorrectAnswers: ["Italy"],
          explanation: "",
          createdBy: "user-1",
          createdAt: "2026-01-01T00:00:00Z",
          questionImage,
        },
      ],
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ReviewBoardPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByAltText(questionImage.altText)).toBeInTheDocument();
  });
});

describe("CollectionPrintView picture", () => {
  const baseItem = { question: "Which country uses this flag?", correctAnswer: "France", incorrectAnswers: ["Italy"] };

  it("prints the picture, including in worksheet mode", () => {
    render(<CollectionPrintView title="Flags" hideAnswers items={[{ ...baseItem, questionImage }]} />);
    const img = screen.getByAltText(questionImage.altText);
    expect(img).toHaveAttribute("src", "/assets/m/fr.webp");
    expect(img).toHaveAttribute("loading", "eager");
  });

  it("prints a text placeholder for an unknown key", () => {
    render(
      <CollectionPrintView
        title="Flags"
        hideAnswers={false}
        items={[{ ...baseItem, questionImage: { key: "curated:flags/zz", altText: "Green and white" } }]}
      />,
    );
    expect(screen.getByText("[Picture unavailable: Green and white]")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});
