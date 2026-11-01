import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QuizCompletionView } from "./QuizCompletionView";
import { createQuizRun, reduceQuizRun, type QuizRunState } from "./quizRun";
import { resetCelebrationsForTests } from "./celebrate";
import type { ItemResponse } from "@/types/api";

const { confetti } = vi.hoisted(() => ({ confetti: vi.fn() }));
vi.mock("canvas-confetti", () => ({ default: confetti }));
vi.mock("@/features/auth/components/SignupPrompt", () => ({ SignupPrompt: () => null }));
vi.mock("@/media/curatedImages", () => ({
  resolveCuratedImage: (key: string) => (key === "curated:flags/fr" ? "/assets/m/fr.webp" : null),
}));
vi.mock("./quizAnalytics", () => ({ trackQuizResultShared: vi.fn() }));

const items = ["a", "b", "c", "d", "e"].map(
  (id) => ({ id, question: `Q ${id}`, correctAnswer: "r", incorrectAnswers: ["w"], explanation: "" }) as unknown as ItemResponse
);

function runWith(correct: number, total: number, view: QuizRunState["view"] = "summary"): QuizRunState {
  let run = createQuizRun(
    { kind: "global", category: null, navigationKeywords: [], filterKeywords: [], quizSize: total },
    items.slice(0, total).map((i) => i.id),
    "anon"
  );
  items.slice(0, total).forEach((item, index) => {
    run = reduceQuizRun(run, {
      type: "answer",
      itemId: item.id,
      selectedAnswer: "x",
      isCorrect: index < correct,
      completedAt: "2026-01-01T00:00:00Z",
    });
  });
  return { ...run, view };
}

function setMatchMedia(value: unknown) {
  Object.defineProperty(window, "matchMedia", { value, configurable: true, writable: true });
}

const share = { kind: "global" as const, text: "I scored", url: "https://q.test/quiz" };

function ui(run: QuizRunState, withShare = true) {
  return (
    <MemoryRouter>
      <QuizCompletionView
        run={run}
        items={items}
        browsePath="/x"
        browseLabel="Browse"
        onReviewMistakes={() => {}}
        onBackToResults={() => {}}
        onPlayAgain={() => {}}
        share={withShare ? share : undefined}
      />
    </MemoryRouter>
  );
}

describe("QuizCompletionView tier, share and confetti", () => {
  beforeEach(() => {
    confetti.mockReset();
    resetCelebrationsForTests();
    setMatchMedia(vi.fn().mockReturnValue({ matches: false }));
  });

  it.each([
    [5, 5, "Perfect score!"],
    [4, 5, "Great job!"],
    [3, 5, "Good effort. Keep going!"],
    [1, 5, "Keep practicing. Every miss is a lesson."],
  ])("shows the tier line for %i/%i", (correct, total, label) => {
    render(ui(runWith(correct, total)));
    expect(screen.getByRole("heading", { name: "Quiz complete" })).toBeInTheDocument();
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("shows Share result after Play again, and none without a descriptor or in the review view", () => {
    const first = render(ui(runWith(2, 5)));
    const labels = screen.getAllByRole("button").map((b) => b.textContent?.trim());
    expect(labels.indexOf("Share result")).toBeGreaterThan(labels.indexOf("Play again"));
    first.unmount();

    const second = render(ui(runWith(2, 5), false));
    expect(screen.queryByRole("button", { name: "Share result" })).toBeNull();
    second.unmount();

    render(ui(runWith(2, 5, "review")));
    expect(screen.queryByRole("button", { name: "Share result" })).toBeNull();
  });

  it("has no tier line and no Share for an empty run", () => {
    render(ui(runWith(0, 0)));
    expect(screen.queryByText(/Perfect score|Great job|Good effort|Keep practicing/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Share result" })).toBeNull();
  });

  it("fires one burst per run at 100% when motion is allowed", async () => {
    const run = runWith(5, 5);
    const view = render(ui(run));
    await waitFor(() => expect(confetti).toHaveBeenCalledTimes(1));
    expect(confetti).toHaveBeenCalledWith(expect.objectContaining({ zIndex: 50, disableForReducedMotion: true }));
    view.rerender(ui(run));
    expect(confetti).toHaveBeenCalledTimes(1);
  });

  it("never loads confetti under reduced motion, without matchMedia, or below 100%", async () => {
    setMatchMedia(vi.fn().mockReturnValue({ matches: true }));
    render(ui(runWith(5, 5)));
    setMatchMedia(undefined);
    render(ui(runWith(5, 5)));
    setMatchMedia(vi.fn().mockReturnValue({ matches: false }));
    render(ui(runWith(4, 5)));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(confetti).not.toHaveBeenCalled();
  });
});

describe("QuizCompletionView review list picture (#407, AC 3.21.6)", () => {
  it("shows a small thumbnail before the question of a missed picture item only", () => {
    const pictureItems = items.map((item, index) =>
      index === 0 ? { ...item, questionImage: { key: "curated:flags/fr", altText: "Three vertical bands" } } : item
    );
    render(
      <MemoryRouter>
        <QuizCompletionView
          run={runWith(0, 2, "review")}
          items={pictureItems}
          browsePath="/x"
          browseLabel="Browse"
          onReviewMistakes={() => {}}
          onBackToResults={() => {}}
          onPlayAgain={() => {}}
        />
      </MemoryRouter>
    );

    expect(screen.getByAltText("Three vertical bands")).toHaveAttribute("loading", "lazy");
    expect(screen.getAllByTestId("question-image")).toHaveLength(1);
  });
});
