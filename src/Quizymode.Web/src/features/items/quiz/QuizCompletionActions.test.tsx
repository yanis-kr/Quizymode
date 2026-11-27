/** Action hierarchy on the default quiz results (#898). The real sign-up card is rendered for an anonymous visitor. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QuizCompletionView } from "./QuizCompletionView";
import { createQuizRun, reduceQuizRun, type QuizRunMode, type QuizRunState } from "./quizRun";
import { resetSignupPromptForTests } from "@/features/auth/utils/signupPrompt";
import type { ItemResponse } from "@/types/api";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ isAuthenticated: false, isLoading: false }) }));
vi.mock("@/features/analytics/analyticsEvents", () => ({ trackEvent: vi.fn(), trackEventOnce: vi.fn() }));
vi.mock("./quizAnalytics", () => ({ trackQuizResultShared: vi.fn() }));
vi.mock("./celebrate", () => ({ celebratePerfectScore: vi.fn() }));

const ids = ["a", "b", "c", "d", "e"];
const items = ids.map((id) => ({ id, question: `Q ${id}`, correctAnswer: "r", incorrectAnswers: ["w"], explanation: "" }) as unknown as ItemResponse);
const share = { kind: "global" as const, text: "I scored", url: "https://q.test/quiz" };

function finishedRun(correct: number, mode: QuizRunMode = "practice"): QuizRunState {
  let run = createQuizRun({ kind: "category", category: "Exams", navigationKeywords: ["aws"], filterKeywords: [], quizSize: 5 }, ids, "anon", mode);
  if (mode === "test") run = reduceQuizRun(run, { type: "start-test", startedAt: "2026-01-01T00:00:00Z", timeLimitSec: null });
  ids.forEach((id, index) => {
    run = reduceQuizRun(run, { type: "answer", itemId: id, selectedAnswer: "x", isCorrect: index < correct, completedAt: "2026-01-01T00:00:05Z" });
  });
  if (mode === "test") run = reduceQuizRun(run, { type: "submit", submittedAt: "2026-01-01T00:00:10Z", reason: "manual", unavailableItemIds: [] });
  return { ...run, view: "summary" };
}

type ViewProps = Parameters<typeof QuizCompletionView>[0];

function renderView(run: QuizRunState, extra: Partial<ViewProps> = {}) {
  return render(
    <MemoryRouter>
      <QuizCompletionView
        run={run}
        items={items}
        browsePath="/categories/exams"
        browseLabel="Browse topic"
        gamesPath="/games/exams"
        onReviewMistakes={() => {}}
        onBackToResults={() => {}}
        onPlayAgain={() => {}}
        {...extra}
      />
    </MemoryRouter>,
  );
}

const next = (size = 5) => ({ size, exhausted: false, total: 0, onNext: () => {} });
const seenAll = { size: 5, exhausted: true, total: 12, onNext: () => {} };

const controls = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>("button, a"));
const label = (element: HTMLElement) => element.textContent?.trim() ?? "";
const filled = (container: HTMLElement) => controls(container).filter((element) => element.classList.contains("bg-indigo-600")).map(label);
const control = (name: string) => screen.getByText(name, { selector: "button, a" });

function expectOutlined(element: HTMLElement) {
  expect(element).toHaveClass("border", "border-indigo-600", "min-h-[44px]");
  expect(element).not.toHaveClass("bg-indigo-600");
  expect(element).not.toHaveClass("underline");
}

function expectTextLink(element: HTMLElement) {
  expect(element).toHaveClass("underline", "min-h-[44px]");
  // No border and no fill, in any state.
  expect(element.className).not.toMatch(/(^|\s|:)(border|bg-)/);
}

beforeEach(() => {
  window.sessionStorage.clear();
  resetSignupPromptForTests();
});

describe("QuizCompletionView action hierarchy (#898)", () => {
  it.each<[string, number, Partial<ViewProps>, string]>([
    ["Next offered", 3, { nextRound: next(), share }, "Next 5 questions"],
    ["Next 10 offered", 3, { nextRound: next(10), share }, "Next 10 questions"],
    ["Next offered with a perfect score", 5, { nextRound: next(), share }, "Next 5 questions"],
    ["no Next, perfect score, Share available", 5, { share }, "Share result"],
    ["no Next otherwise", 3, { share }, "Play again"],
    ["no Next, perfect score, no Share", 5, {}, "Play again"],
    ["all questions seen", 3, { nextRound: seenAll, share }, "Start over"],
    ["all questions seen with a perfect score", 5, { nextRound: seenAll, share }, "Share result"],
    ["all questions seen, perfect score, no Share", 5, { nextRound: seenAll }, "Start over"],
  ])("AC 3.6.45 exactly one filled control with the sign-up card shown: %s", (_name, correct, extra, primary) => {
    const { container } = renderView(finishedRun(correct), extra);
    expect(screen.getByTestId("signup-prompt")).toBeInTheDocument();
    expect(filled(container)).toEqual([primary]);
    expect(control(primary)).toHaveClass("min-h-[44px]");
  });

  it("AC 3.6.45 shows Review mistakes as an outlined button after a miss", () => {
    renderView(finishedRun(3), { share });
    expectOutlined(screen.getByRole("button", { name: "Review mistakes" }));
  });

  it("AC 3.6.45 shows Review all and Review mistakes as outlined buttons in a Test", () => {
    const { container } = renderView(finishedRun(3, "test"), { share, onReviewAll: () => {} });
    expectOutlined(screen.getByRole("button", { name: "Review all" }));
    expectOutlined(screen.getByRole("button", { name: "Review mistakes" }));
    expect(filled(container)).toEqual(["Play again"]);
  });

  it.each<[string, number, Partial<ViewProps>, string[]]>([
    ["Next offered", 3, { nextRound: next(), share }, ["Play again (same questions)", "Share result", "Play a game with these questions", "Browse topic"]],
    ["perfect score", 5, { share }, ["Play again", "Play a game with these questions", "Browse topic"]],
    ["no Next otherwise", 3, { share }, ["Share result", "Play a game with these questions", "Browse topic"]],
    ["all questions seen", 3, { nextRound: seenAll, share }, ["Share result", "Play a game with these questions", "Browse topic"]],
    ["all questions seen with a perfect score", 5, { nextRound: seenAll, share }, ["Start over", "Play a game with these questions", "Browse topic"]],
  ])("AC 3.6.45 shows every other action as an underlined text link: %s", (_name, correct, extra, links) => {
    renderView(finishedRun(correct), extra);
    for (const name of links) expectTextLink(control(name));
    for (const name of links.filter((link) => link === "Share result" || link.startsWith("Play again") || link === "Start over")) {
      expect(control(name).tagName).toBe("BUTTON");
    }
  });

  it("AC 3.6.45 AC 3.6.50 keeps the behaviour of the text links: replay, the share dialog and both destinations", async () => {
    const onPlayAgain = vi.fn();
    renderView(finishedRun(3), { nextRound: next(), share, onPlayAgain });
    const user = userEvent.setup({ delay: null });

    expect(screen.getByRole("link", { name: "Play a game with these questions" })).toHaveAttribute("href", "/games/exams");
    expect(screen.getByRole("link", { name: "Browse topic" })).toHaveAttribute("href", "/categories/exams");
    await user.click(screen.getByRole("button", { name: "Play again (same questions)" }));
    expect(onPlayAgain).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Share result" }));
    expect(screen.getByRole("dialog", { name: "Share your result" })).toBeInTheDocument();
  });

  it.each<[string, number, QuizRunMode, Partial<ViewProps>, string[]]>([
    ["Next offered", 3, "practice", { nextRound: next(), share }, [
      "Next 5 questions", "Review mistakes", "Play again (same questions)", "Share result", "Play a game with these questions", "Browse topic",
    ]],
    ["perfect score without Next", 5, "practice", { share }, ["Share result", "Play again", "Play a game with these questions", "Browse topic"]],
    ["all questions seen", 3, "practice", { nextRound: seenAll, share }, [
      "Start over", "Review mistakes", "Share result", "Play a game with these questions", "Browse topic",
    ]],
    ["Test", 3, "test", { share, onReviewAll: () => {} }, [
      "Play again", "Review all", "Review mistakes", "Share result", "Play a game with these questions", "Browse topic",
    ]],
  ])("AC 3.6.45 keeps DOM and keyboard order primary, outlined, text links, Keep going: %s", async (_name, correct, mode, extra, order) => {
    const { container } = renderView(finishedRun(correct, mode), { ...extra, keepGoing: <a href="/next-set">Keep going tile</a> });
    const expected = [...order, "Keep going tile"];

    expect(controls(container).map(label).slice(0, expected.length)).toEqual(expected);

    const user = userEvent.setup({ delay: null });
    expect(screen.getByRole("heading", { level: 2 })).toHaveFocus();
    for (const name of expected) {
      await user.tab();
      expect(control(name)).toHaveFocus();
    }
  });

  it("AC 3.6.45 puts the You have seen all line before the primary action", () => {
    renderView(finishedRun(3), { nextRound: seenAll, share });
    const line = screen.getByRole("status");
    expect(line).toHaveTextContent("You have seen all 12.");
    expect(line.compareDocumentPosition(control("Start over")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each(["starter", "daily"] as const)("leaves the %s results and their filled sign-up action as they were", (variant) => {
    renderView(finishedRun(3), { variant, share });
    expect(screen.getByRole("link", { name: "Create a free account" })).toHaveClass("bg-indigo-600");
    expect(control("Share result")).not.toHaveClass("underline");
  });
});
