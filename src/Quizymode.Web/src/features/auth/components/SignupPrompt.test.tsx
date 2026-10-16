import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { SignupPrompt } from "./SignupPrompt";
import { AUTH_REASONS, parseAuthIntent, type AuthReason } from "../utils/authIntent";
import { SIGNUP_PROMPT_COPY, resetSignupPromptForTests } from "../utils/signupPrompt";
import { flushAnalyticsEvents, resetAnalyticsEventsForTests } from "@/features/analytics/analyticsEvents";
import { QuizCompletionView } from "@/features/items/quiz/QuizCompletionView";
import type { QuizRunState } from "@/features/items/quiz/quizRun";

const { mockTrackEvents, authState } = vi.hoisted(() => ({
  mockTrackEvents: vi.fn(),
  authState: { isAuthenticated: false, isLoading: false },
}));

vi.mock("@/api/analytics", () => ({
  analyticsApi: { trackEvents: mockTrackEvents },
}));

vi.mock("@/utils/pageViewTracking", () => ({
  getPageViewSessionId: () => "session-1",
  isInternalBrowser: () => false,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

interface SentEvent {
  name: string;
  path: string;
  contextType?: string;
  contextId?: string;
  clientEventId?: string;
  [key: string]: unknown;
}

function sentEvents(): SentEvent[] {
  return mockTrackEvents.mock.calls.flatMap(([body]) => (body as { events: SentEvent[] }).events);
}

function SignupDestination() {
  const location = useLocation();
  const intent = parseAuthIntent(location.search);
  return (
    <div>
      <p>signup page</p>
      <p data-testid="intent-reason">{intent.reason}</p>
      <p data-testid="intent-return">{intent.returnTo}</p>
    </div>
  );
}

function renderPrompt(reason: AuthReason, entry = "/quiz/collections/abc?quizSize=5", strict = false) {
  const tree = (
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/signup" element={<SignupDestination />} />
        <Route path="*" element={<SignupPrompt reason={reason} />} />
      </Routes>
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

describe("SignupPrompt (CONV-001, AC 4.2.10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTrackEvents.mockResolvedValue({ accepted: 1, duplicates: 0 });
    window.sessionStorage.clear();
    resetAnalyticsEventsForTests();
    resetSignupPromptForTests();
    authState.isAuthenticated = false;
    authState.isLoading = false;
  });

  it.each(AUTH_REASONS)("renders benefit-led copy and a signup link carrying reason and returnTo for %s", (reason) => {
    renderPrompt(reason);
    const copy = SIGNUP_PROMPT_COPY[reason];
    expect(screen.getByRole("heading", { name: copy.heading })).toBeInTheDocument();
    expect(screen.getByText(copy.body)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: copy.cta });
    const href = new URL(link.getAttribute("href")!, "http://localhost");
    expect(href.pathname).toBe("/signup");
    expect(href.searchParams.get("reason")).toBe(reason);
    expect(href.searchParams.get("returnTo")).toBe("/quiz/collections/abc?quizSize=5");
    const login = new URL(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")!, "http://localhost");
    expect(login.pathname).toBe("/login");
    expect(login.searchParams.get("reason")).toBe(reason);
  });

  it("never promises score sync or guest progress import", () => {
    for (const reason of AUTH_REASONS) {
      const text = Object.values(SIGNUP_PROMPT_COPY[reason]).join(" ").toLowerCase();
      expect(text).not.toMatch(/sync|import|restore|another device|saved to your account/);
    }
  });

  it("is not shown to authenticated users or while auth is resolving, and records no impression", async () => {
    authState.isAuthenticated = true;
    const { unmount } = renderPrompt("save-progress");
    expect(screen.queryByTestId("signup-prompt")).toBeNull();
    unmount();

    authState.isAuthenticated = false;
    authState.isLoading = true;
    renderPrompt("save-progress");
    expect(screen.queryByTestId("signup-prompt")).toBeNull();
    await flushAnalyticsEvents();
    expect(mockTrackEvents).not.toHaveBeenCalled();
  });

  it("clicking through lands on /signup with the allowlisted reason and the safe return path", () => {
    renderPrompt("save-progress");
    fireEvent.click(screen.getByRole("link", { name: SIGNUP_PROMPT_COPY["save-progress"].cta }));
    expect(screen.getByText("signup page")).toBeInTheDocument();
    expect(screen.getByTestId("intent-reason")).toHaveTextContent("save-progress");
    expect(screen.getByTestId("intent-return")).toHaveTextContent("/quiz/collections/abc?quizSize=5");
  });

  it("dismissal hides the prompt for the rest of the tab session without touching other reasons", () => {
    const { unmount } = renderPrompt("save-progress");
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByTestId("signup-prompt")).toBeNull();
    unmount();

    const second = renderPrompt("save-progress");
    expect(screen.queryByTestId("signup-prompt")).toBeNull();
    second.unmount();

    // A reload in the same tab keeps it dismissed (sessionStorage), not just this page load.
    resetSignupPromptForTests();
    const third = renderPrompt("save-progress");
    expect(screen.queryByTestId("signup-prompt")).toBeNull();
    third.unmount();

    renderPrompt("keep-collection");
    expect(screen.getByTestId("signup-prompt")).toBeInTheDocument();
  });

  it("records one impression and one click per reason per tab session with only auth context", async () => {
    const first = renderPrompt("save-progress", "/quiz/collections/abc?quizSize=5", true);
    await waitFor(() => expect(mockTrackEvents).toHaveBeenCalled());
    first.unmount();
    renderPrompt("save-progress", "/quiz/collections/abc?quizSize=5", true);
    fireEvent.click(screen.getByRole("link", { name: SIGNUP_PROMPT_COPY["save-progress"].cta }));
    await flushAnalyticsEvents();

    const events = sentEvents();
    expect(events.map((event) => event.name).sort()).toEqual(["signup_prompt_clicked", "signup_prompt_viewed"]);
    for (const event of events) {
      expect(event).toEqual({
        name: event.name,
        path: expect.any(String),
        contextType: "auth",
        contextId: "save-progress",
        clientEventId: "prompt:save-progress",
      });
    }
    expect(JSON.stringify(events)).not.toMatch(/returnTo|quizSize|@/);
  });
});

describe("Quiz completion summary signup prompt", () => {
  const run = {
    runId: "run-1",
    view: "summary",
    itemIds: ["a", "b"],
    outcomes: {
      a: { itemId: "a", selectedAnswer: "x", isCorrect: true },
      b: { itemId: "b", selectedAnswer: "y", isCorrect: false },
    },
  } as unknown as QuizRunState;

  function renderCompletion(view: "summary" | "review" = "summary") {
    return render(
      <MemoryRouter initialEntries={["/quiz/collections/abc"]}>
        <QuizCompletionView
          run={{ ...run, view } as QuizRunState}
          items={[]}
          browsePath="/collections/abc"
          browseLabel="Back to collection"
          onReviewMistakes={vi.fn()}
          onBackToResults={vi.fn()}
          onPlayAgain={vi.fn()}
        />
      </MemoryRouter>
    );
  }

  beforeEach(() => {
    window.sessionStorage.clear();
    resetSignupPromptForTests();
    resetAnalyticsEventsForTests();
    authState.isAuthenticated = false;
    authState.isLoading = false;
  });

  it("shows the save-progress prompt to anonymous visitors on the summary only", () => {
    const { unmount } = renderCompletion();
    expect(screen.getByRole("heading", { name: "Quiz complete" })).toBeInTheDocument();
    expect(screen.getByTestId("signup-prompt")).toHaveAttribute("data-reason", "save-progress");
    unmount();
    renderCompletion("review");
    expect(screen.queryByTestId("signup-prompt")).toBeNull();
  });

  it("does not show the prompt after an authenticated completion", () => {
    authState.isAuthenticated = true;
    renderCompletion();
    expect(screen.getByRole("heading", { name: "Quiz complete" })).toBeInTheDocument();
    expect(screen.queryByTestId("signup-prompt")).toBeNull();
  });

  it("dismissing keeps the result summary and its actions on screen", () => {
    renderCompletion();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByTestId("signup-prompt")).toBeNull();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play again" })).toBeInTheDocument();
  });
});
