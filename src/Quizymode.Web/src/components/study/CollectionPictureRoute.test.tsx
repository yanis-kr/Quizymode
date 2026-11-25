import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ItemResponse } from "@/types/api";
import { mediaApi } from "@/api/media";
import { AnswerFeedbackCard } from "./AnswerFeedbackCard";
import { ExploreRenderer } from "./ExploreRenderer";
import { LearnQuestion } from "./LearnQuestion";
import { LearnRecap } from "./LearnRecap";
import { QuizRenderer } from "./QuizRenderer";
import { QuizCompletionView } from "@/features/items/quiz/QuizCompletionView";
import { createQuizRun, reduceQuizRun } from "@/features/items/quiz/quizRun";

// #403: inside a collection run every uploaded (`media:`) picture is requested through the collection route
// (mediaApi.content's third argument), outside a collection through the item route (undefined). The renderers are
// rendered in a router without a collection param so the explicit prop, not the URL, is what is being asserted.
vi.mock("@/api/media", () => ({ mediaApi: { content: vi.fn() } }));
vi.mock("@/hooks/useSpeech", () => ({ useSpeech: () => ({ isSupported: false }) }));
vi.mock("@/features/auth/components/SignupPrompt", () => ({ SignupPrompt: () => null }));
vi.mock("@/features/items/quiz/quizAnalytics", () => ({ trackQuizResultShared: vi.fn() }));

const question = { key: "media:11111111111111111111111111111111", altText: "Q picture", revision: 3 };
const explanation = { key: "media:22222222222222222222222222222222", altText: "E picture", revision: 4 };

const item: ItemResponse = {
  id: "item-1",
  category: "Math",
  isPrivate: false,
  question: "What is shown?",
  correctAnswer: "A graph",
  incorrectAnswers: ["A map", "A chart"],
  explanation: "It is a graph.",
  createdAt: "2026-01-01T00:00:00Z",
  keywords: [],
  collections: [],
  questionImage: question,
  explanationImage: explanation,
};

const signal = expect.any(AbortSignal);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(mediaApi.content).mockResolvedValue(new Blob(["img"], { type: "image/webp" }));
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() });
});

function inRouter(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe.each([
  ["a collection run", "col-1"],
  ["a run outside a collection", undefined],
])("%s", (_name, collectionId) => {
  it("QuizRenderer requests the question and explanation pictures through the right route", async () => {
    inRouter(
      <QuizRenderer
        item={item}
        options={["A graph", "A map", "A chart"]}
        selectedAnswer="A graph"
        showAnswer
        onAnswerSelect={() => {}}
        stats={{ total: 1, correct: 1 }}
        collectionId={collectionId}
      />,
    );
    await waitFor(() => expect(mediaApi.content).toHaveBeenCalledTimes(2));
    expect(mediaApi.content).toHaveBeenCalledWith("item-1", "question", collectionId, signal, 3);
    expect(mediaApi.content).toHaveBeenCalledWith("item-1", "explanation", collectionId, signal, 4);
  });

  it("AnswerFeedbackCard requests the explanation picture through the right route", async () => {
    inRouter(<AnswerFeedbackCard item={item} selectedAnswer="A map" isCorrect={false} isLast={false} collectionId={collectionId} />);
    await waitFor(() => expect(mediaApi.content).toHaveBeenCalledTimes(1));
    expect(mediaApi.content).toHaveBeenCalledWith("item-1", "explanation", collectionId, signal, 4);
  });

  it("ExploreRenderer requests the question picture, then the explanation picture once flipped", async () => {
    inRouter(<ExploreRenderer item={item} isFlipped collectionId={collectionId} />);
    await waitFor(() => expect(mediaApi.content).toHaveBeenCalledTimes(2));
    expect(mediaApi.content).toHaveBeenCalledWith("item-1", "question", collectionId, signal, 3);
    expect(mediaApi.content).toHaveBeenCalledWith("item-1", "explanation", collectionId, signal, 4);
  });

  it("LearnQuestion requests the question picture through the right route", async () => {
    inRouter(
      <LearnQuestion
        item={item}
        options={["A graph", "A map", "A chart"]}
        selectedAnswer={null}
        showAnswer={false}
        onAnswerSelect={() => {}}
        collectionId={collectionId}
      />,
    );
    await waitFor(() => expect(mediaApi.content).toHaveBeenCalledTimes(1));
    expect(mediaApi.content).toHaveBeenCalledWith("item-1", "question", collectionId, signal, 3);
  });

  it("LearnRecap requests the thumbnails through the right route", async () => {
    inRouter(
      <LearnRecap
        roundNumber={1}
        rows={[{ itemId: "item-1", question: "What is shown?", questionImage: question, status: "mastered" }]}
        mastered={1}
        total={1}
        onContinue={() => {}}
        onStartOver={() => {}}
        collectionId={collectionId}
      />,
    );
    await waitFor(() => expect(mediaApi.content).toHaveBeenCalledTimes(1));
    expect(mediaApi.content).toHaveBeenCalledWith("item-1", "question", collectionId, signal, 3);
  });

  it("QuizCompletionView requests the review thumbnails through the right route", async () => {
    let run = createQuizRun(
      { kind: "global", category: null, navigationKeywords: [], filterKeywords: [], quizSize: 1 },
      [item.id],
      "anon",
    );
    run = reduceQuizRun(run, { type: "answer", itemId: item.id, selectedAnswer: "A map", isCorrect: false, completedAt: "2026-01-01T00:00:00Z" });
    inRouter(
      <QuizCompletionView
        run={{ ...run, view: "review" }}
        items={[item]}
        browsePath="/x"
        browseLabel="Browse"
        onReviewMistakes={() => {}}
        onBackToResults={() => {}}
        onPlayAgain={() => {}}
        collectionId={collectionId}
      />,
    );
    await waitFor(() => expect(mediaApi.content).toHaveBeenCalledTimes(2));
    expect(mediaApi.content).toHaveBeenCalledWith("item-1", "question", collectionId, signal, 3);
    expect(mediaApi.content).toHaveBeenCalledWith("item-1", "explanation", collectionId, signal, 4);
    expect(screen.getByText("What is shown?")).toBeInTheDocument();
  });
});
