import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ScopeLandingHeader, type ScopeLandingHeaderProps } from "./ScopeLandingHeader";
import { buildScopeStudyHref, withQuizSize } from "@/utils/scopeStudyHref";

const NAV = ["brain-teasers", "aha-moments"];

function renderHeader(overrides: Partial<ScopeLandingHeaderProps> = {}) {
  const props: ScopeLandingHeaderProps = {
    title: "Aha! Brain Teasers",
    description: "Riddles with a twist.",
    count: 33,
    countState: "ready",
    games: "available",
    quizHref: (size) => {
      const href = buildScopeStudyHref("quiz", "trivia", NAV);
      return size === undefined ? href : withQuizSize(href, size);
    },
    flashcardsHref: buildScopeStudyHref("explore", "trivia", NAV),
    gamesHref: buildScopeStudyHref("games", "trivia", NAV),
    ...overrides,
  };
  return render(
    <MemoryRouter>
      <ScopeLandingHeader {...props} />
    </MemoryRouter>
  );
}

const linkNames = () => screen.getAllByRole("link").map((l) => l.textContent);

describe("ScopeLandingHeader (#646)", () => {
  it("AC 3.5.7 shows one h1, the description and the count, with only Play 5 and Play 10", () => {
    renderHeader();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Aha! Brain Teasers" })).toBeInTheDocument();
    expect(screen.getByText("Riddles with a twist.")).toBeInTheDocument();
    expect(screen.getByText("33 questions")).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "Play these questions" });
    expect(within(group).getAllByRole("link").map((l) => l.textContent)).toEqual(["Play 5", "Play 10"]);
    expect(screen.getByRole("link", { name: "Play 5" }).className).toContain("bg-indigo-600");
    expect(screen.getByRole("link", { name: "Play 10" }).className).not.toContain("bg-indigo-600");
    expect(screen.queryByRole("link", { name: "Flashcards" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Games" })).toBeNull();
  });

  it("keeps the same scope on every link and adds the size only to the Play buttons", () => {
    renderHeader();
    expect(screen.getByRole("link", { name: "Play 5" })).toHaveAttribute(
      "href",
      "/quiz/trivia?nav=brain-teasers%2Caha-moments&keywords=brain-teasers%2Caha-moments&size=5"
    );
    expect(screen.getByRole("link", { name: "Play 10" })).toHaveAttribute(
      "href",
      "/quiz/trivia?nav=brain-teasers%2Caha-moments&keywords=brain-teasers%2Caha-moments&size=10"
    );
  });

  it("AC 3.6.29 keeps the collection links to Flashcards and Games", () => {
    renderHeader({ variant: "collection", count: 40 });
    expect(screen.getByRole("link", { name: "Flashcards" })).toHaveAttribute(
      "href",
      "/explore/trivia?nav=brain-teasers%2Caha-moments&keywords=brain-teasers%2Caha-moments"
    );
    expect(screen.getByRole("link", { name: "Games" })).toHaveAttribute(
      "href",
      "/games/trivia?nav=brain-teasers%2Caha-moments&keywords=brain-teasers%2Caha-moments"
    );
  });

  it("uses size without a query clash for a category root scope", () => {
    expect(withQuizSize(buildScopeStudyHref("quiz", "trivia", []), 5)).toBe("/quiz/trivia?size=5");
  });

  it("hides Play 10 for 5 to 9 questions and lets Play 5 span both columns", () => {
    renderHeader({ count: 7 });
    expect(linkNames()).toEqual(["Play 5"]);
    expect(screen.getByRole("link", { name: "Play 5" }).className).toContain("col-span-2");
  });

  it("offers a single Play quiz (N) without a size for 1 to 4 questions", () => {
    renderHeader({ count: 3 });
    expect(linkNames()).toEqual(["Play quiz (3)"]);
    expect(screen.getByRole("link", { name: "Play quiz (3)" }).getAttribute("href")).not.toContain("size=");
    expect(screen.getByText("3 questions")).toBeInTheDocument();
  });

  it("uses the singular for one question", () => {
    renderHeader({ count: 1 });
    expect(screen.getByText("1 question")).toBeInTheDocument();
  });

  it("shows no buttons and a Browse categories link for an empty scope", () => {
    renderHeader({ count: 0 });
    expect(screen.getByText("No questions here yet.")).toBeInTheDocument();
    expect(linkNames()).toEqual(["Browse categories"]);
    expect(screen.getByRole("link", { name: "Browse categories" })).toHaveAttribute("href", "/categories");
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("holds a collection's Games slot with an aria-hidden skeleton while it is checked", () => {
    const { container } = renderHeader({ variant: "collection", count: 7, games: "loading" });
    expect(linkNames()).toEqual(["Play quiz (7)", "Flashcards"]);
    expect(container.querySelectorAll("[aria-hidden='true'].animate-pulse")).toHaveLength(1);
  });

  it("omits a collection's Games link when it is unavailable", () => {
    renderHeader({ variant: "collection", count: 7, games: "unavailable" });
    expect(linkNames()).toEqual(["Play quiz (7)", "Flashcards"]);
  });

  it("shows skeletons and aria-busy while the count loads, with no play links", () => {
    const { container } = renderHeader({ countState: "loading", count: undefined });
    expect(screen.getByTestId("scope-landing-header")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(container.querySelectorAll("[aria-hidden='true'].animate-pulse").length).toBeGreaterThan(0);
  });

  it("AC 3.5.7 says the count is unavailable and shows no empty button group when the count fails", () => {
    renderHeader({ countState: "error", count: undefined });
    expect(screen.getByText("Could not load the question count.")).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryByRole("group", { name: "Play these questions" })).toBeNull();
  });

  it("AC 3.5.7 keeps Exam simulation when the count of an exam scope fails", () => {
    renderHeader({ countState: "error", count: undefined, examSimulationHref: "/quiz/exams?mode=test" });
    expect(linkNames()).toEqual(["Exam simulation"]);
  });

  it("omits the description element when there is none and uses 44px targets", () => {
    const { container } = renderHeader({ description: null });
    expect(container.querySelector("p.line-clamp-2")).toBeNull();
    for (const link of screen.getAllByRole("link")) expect(link.className).toContain("min-h-[44px]");
  });

  it("AC 3.6.29 gives a collection with 10 or more questions Play 5, Play 10 and Play all (N)", () => {
    renderHeader({ variant: "collection", count: 40 });
    expect(linkNames()).toEqual(["Play 5", "Play 10", "Play all (40)", "Flashcards", "Games"]);
    expect(screen.getByRole("link", { name: "Play 5" })).toHaveAttribute("href", expect.stringContaining("size=5"));
    expect(screen.getByRole("link", { name: "Play 10" })).toHaveAttribute("href", expect.stringContaining("size=10"));
    expect(screen.getByRole("link", { name: "Play all (40)" }).getAttribute("href")).not.toContain("size=");
  });

  it("AC 3.6.29 keeps one Play quiz (N) for a collection with fewer than 10 questions", () => {
    renderHeader({ variant: "collection", count: 7 });
    expect(linkNames()).toEqual(["Play quiz (7)", "Flashcards", "Games"]);
  });

  it("AC 3.6.25 AC 3.6.26 shows the unofficial-practice line and Exam simulation for an exam scope", () => {
    renderHeader({ unofficial: true, examSimulationHref: "/quiz/exams?mode=test" });
    expect(screen.getByText("Unofficial practice questions. Not affiliated with the exam provider.")).toBeInTheDocument();
    expect(linkNames()).toEqual(["Play 5", "Play 10", "Exam simulation"]);
    expect(screen.getByRole("link", { name: "Exam simulation" })).toHaveAttribute("href", "/quiz/exams?mode=test");
    expect(screen.getByText("Timed. Answers shown at the end.")).toBeInTheDocument();
  });

  it("AC 3.6.28 shows neither the unofficial line nor Exam simulation for a non-exam scope", () => {
    renderHeader();
    expect(screen.queryByText(/Unofficial practice questions/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Exam simulation" })).toBeNull();
    expect(screen.queryByText("Timed. Answers shown at the end.")).toBeNull();
  });
  it("AC 3.33.1 shows 'N of M known' when a known count is given and hides it otherwise", () => {
    const { unmount } = renderHeader({ knownCount: 12, count: 197 });
    expect(screen.getByTestId("set-progress")).toHaveTextContent("12 of 197 known");
    expect(screen.getByTestId("set-progress")).toHaveAttribute("data-complete", "false");
    unmount();
    renderHeader({ count: 197 });
    expect(screen.queryByTestId("set-progress")).toBeNull();
  });

  it("AC 3.33.1 hides the progress line of a category scope while nothing is known", () => {
    renderHeader({ knownCount: 0, count: 197 });
    expect(screen.queryByTestId("set-progress")).toBeNull();
    expect(screen.queryByText(/of 197 known/)).toBeNull();
  });

  it("AC 3.33.1 keeps the progress line of a collection when nothing is known", () => {
    renderHeader({ variant: "collection", knownCount: 0, count: 40 });
    expect(screen.getByTestId("set-progress")).toHaveTextContent("0 of 40 known");
  });

  it("AC 3.33.3 shows a completed state when every item is known", () => {
    renderHeader({ knownCount: 33, count: 33 });
    expect(screen.getByTestId("set-progress")).toHaveAttribute("data-complete", "true");
    expect(screen.getByTestId("set-progress")).toHaveTextContent("Completed");
  });
});
