import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { FixedSetQuiz } from "./FixedSetQuiz";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import { resetStudyHotkeysPreferenceForTests } from "@/components/study/studyHotkeysPreference";

vi.mock("@/features/analytics/analyticsEvents", () => ({
  flushDeferredAnalyticsEvents: vi.fn(),
  trackEventDeferredOnce: vi.fn(),
  trackEventOnce: vi.fn(),
}));
vi.mock("@/features/auth/components/SignupPrompt", () => ({ SignupPrompt: () => null }));

function makeItem(id: string) {
  return {
    id,
    category: "c",
    isPrivate: false,
    question: `Question ${id}`,
    correctAnswer: `Right ${id}`,
    incorrectAnswers: ["w1", "w2", "w3"],
    explanation: "",
    createdAt: "2026-01-01T00:00:00Z",
    keywords: [],
    collections: [],
  };
}

function press(init: KeyboardEventInit) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  });
}

function renderQuiz(count = 2, overrides: Record<string, unknown> = {}) {
  return render(
    <MemoryRouter>
      <FixedSetQuiz
        items={Array.from({ length: count }, (_, i) => ({ ...makeItem(`i${i + 1}`), ...overrides }))}
        identityKey="anon"
        analytics={{ contextType: "daily" }}
        browsePath="/"
        browseLabel="Back"
      />
    </MemoryRouter>
  );
}

const optionButtons = () => screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-keyshortcuts"));

describe("FixedSetQuiz keyboard shortcuts", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    resetStudyHotkeysPreferenceForTests();
  });

  it("answers with 1 once and ignores a second answer key", () => {
    renderQuiz();
    press({ key: "1", code: "Digit1" });
    expect(screen.getByText(/1 answered/)).toBeInTheDocument();
    press({ key: "2", code: "Digit2" });
    press({ key: "b", code: "KeyB" });
    expect(screen.getByText(/1 answered/)).toBeInTheDocument();
    expect(optionButtons().every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it("answers with Shift+Digit1 and ignores a key for a missing option", () => {
    renderQuiz();
    press({ key: "5", code: "Digit5" });
    press({ key: "e", code: "KeyE" });
    expect(screen.getByText(/0 answered/)).toBeInTheDocument();
    press({ key: "&", code: "Digit1", shiftKey: true });
    expect(screen.getByText(/1 answered/)).toBeInTheDocument();
  });

  it("answers with a letter", () => {
    renderQuiz();
    press({ key: "B", code: "KeyB" });
    expect(screen.getByText(/1 answered/)).toBeInTheDocument();
  });

  it("moves to the next question on Enter and focuses the heading", async () => {
    renderQuiz();
    press({ key: "Enter", code: "Enter" });
    expect(screen.getByText("Question 1 of 2")).toBeInTheDocument();
    press({ key: "1", code: "Digit1" });
    press({ key: "Enter", code: "Enter" });
    expect(screen.getByText("Question 2 of 2")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Question 2 of 2")).toHaveFocus());
  });

  it("arrows mirror Previous and Next, and Right is inert while Next is disabled", () => {
    renderQuiz();
    press({ key: "ArrowRight" });
    expect(screen.getByText("Question 1 of 2")).toBeInTheDocument();
    press({ key: "1", code: "Digit1" });
    press({ key: "ArrowRight" });
    expect(screen.getByText("Question 2 of 2")).toBeInTheDocument();
    press({ key: "ArrowLeft" });
    expect(screen.getByText("Question 1 of 2")).toBeInTheDocument();
    press({ key: "ArrowLeft" });
    expect(screen.getByText("Question 1 of 2")).toBeInTheDocument();
  });

  it("Enter after the last answer opens results, and arrows never do", () => {
    renderQuiz(1);
    press({ key: "1", code: "Digit1" });
    press({ key: "ArrowRight" });
    expect(screen.queryByRole("heading", { name: "Quiz complete" })).toBeNull();
    press({ key: "Enter", code: "Enter" });
    expect(screen.getByRole("heading", { name: "Quiz complete" })).toBeInTheDocument();
  });

  it("on the results screen digits, arrows and Enter do nothing but ? opens the dialog", () => {
    renderQuiz(1);
    press({ key: "1", code: "Digit1" });
    press({ key: "Enter", code: "Enter" });
    press({ key: "1", code: "Digit1" });
    press({ key: "ArrowLeft" });
    press({ key: "Enter", code: "Enter" });
    expect(screen.getByRole("heading", { name: "Quiz complete" })).toBeInTheDocument();
    press({ key: "?" });
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    expect(screen.getByText("No other shortcuts on this screen.")).toBeInTheDocument();
  });

  it("puts the Shortcuts button outside the live heading and opens the dialog", () => {
    renderQuiz();
    const heading = screen.getByText("Question 1 of 2");
    const hint = screen.getByRole("button", { name: "Keyboard shortcuts" });
    expect(heading.contains(hint)).toBe(false);
    expect(heading).toHaveAttribute("aria-live", "polite");
    fireEvent.click(hint);
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    // Digits are inert while the dialog is open.
    press({ key: "1", code: "Digit1" });
    expect(screen.getByText(/0 answered/)).toBeInTheDocument();
  });

  it("gives every option aria-keyshortcuts", () => {
    renderQuiz();
    expect(optionButtons().map((b) => b.getAttribute("aria-keyshortcuts"))).toEqual(["1 A", "2 B", "3 C", "4 D"]);
  });
});

const answer = (text: string) => fireEvent.click(optionButtons().find((b) => b.textContent?.includes(text))!);

describe("FixedSetQuiz answer feedback card (#648)", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    resetStudyHotkeysPreferenceForTests();
  });

  it("mounts one polite live region before answering and puts the card inside it", () => {
    renderQuiz(2, { explanation: "Because." });
    const regions = screen.getAllByRole("status");
    expect(regions).toHaveLength(1);
    expect(regions[0]).toBeEmptyDOMElement();
    answer("Right");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toContainElement(screen.getByTestId("answer-feedback-card"));
  });

  it("correct answer: Correct!, the answer and the fact; options are replaced by the card", () => {
    renderQuiz(2, { explanation: "Because." });
    answer("Right");
    const card = screen.getByTestId("answer-feedback-card");
    expect(card).toHaveTextContent("Correct!");
    expect(card).toHaveTextContent("Answer: Right i1");
    expect(card).toHaveTextContent("Did you know?");
    expect(card).toHaveTextContent("Because.");
    expect(card).not.toHaveTextContent("You picked");
    expect(optionButtons()).toHaveLength(0);
  });

  it("incorrect answer: Not quite., what was picked and the reason", () => {
    renderQuiz(2, { explanation: "Because.", incorrectAnswerRationale: { 0: "w1 is a decoy." } });
    answer("w1");
    const card = screen.getByTestId("answer-feedback-card");
    expect(card).toHaveTextContent("Not quite.");
    expect(card).toHaveTextContent("You picked: w1");
    expect(screen.getByTestId("option-rationale")).toHaveTextContent("w1 is a decoy.");
  });

  it("no explanation: no 'Did you know?' label and no empty fact", () => {
    renderQuiz(2);
    answer("Right");
    expect(screen.getByTestId("answer-feedback-card")).toHaveTextContent("Answer: Right i1");
    expect(screen.queryByText("Did you know?")).toBeNull();
  });

  it("has exactly one Next button while the card shows, and Next moves on and focuses the question line", async () => {
    renderQuiz(2);
    answer("Right");
    expect(screen.getAllByRole("button", { name: "Next" })).toHaveLength(1);
    const next = screen.getByRole("button", { name: "Next" });
    expect(screen.getByTestId("answer-feedback-card")).toContainElement(next);
    await waitFor(() => expect(next).toHaveFocus());
    fireEvent.click(next);
    expect(screen.getByText("Question 2 of 2")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Question 2 of 2")).toHaveFocus());
    expect(screen.queryByTestId("answer-feedback-card")).toBeNull();
  });

  it("last question: the card says See my score and opens the results", () => {
    renderQuiz(1);
    answer("Right");
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(screen.queryByRole("button", { name: "View results" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "See my score" }));
    expect(screen.getByRole("heading", { name: "Quiz complete" })).toBeInTheDocument();
  });

  it("keeps Previous below the card and it still goes back", () => {
    renderQuiz(2);
    answer("Right");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    answer("Right");
    const card = screen.getByTestId("answer-feedback-card");
    const previous = screen.getByRole("button", { name: "Previous" });
    expect(card.contains(previous)).toBe(false);
    fireEvent.click(previous);
    expect(screen.getByText("Question 1 of 2")).toBeInTheDocument();
  });

  it("is not click-to-advance outside the starter", () => {
    renderQuiz(2, { explanation: "Because." });
    answer("Right");
    fireEvent.click(screen.getByText("Because."));
    expect(screen.getByText("Question 1 of 2")).toBeInTheDocument();
  });
});
