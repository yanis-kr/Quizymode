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

function renderQuiz(count = 2) {
  return render(
    <MemoryRouter>
      <FixedSetQuiz
        items={Array.from({ length: count }, (_, i) => makeItem(`i${i + 1}`))}
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
