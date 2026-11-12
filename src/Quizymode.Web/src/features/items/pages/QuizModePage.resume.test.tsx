import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import QuizModePage from "./QuizModePage";
import { itemsApi } from "@/api/items";
import { categoriesApi } from "@/api/categories";
import { keywordsApi } from "@/api/keywords";
import { collectionsApi } from "@/api/collections";
import {
  QUIZ_COMPLETED_EVENT,
  createQuizRun,
  reduceQuizRun,
  type QuizCompletionSnapshot,
  type QuizRunState,
} from "@/features/items/quiz/quizRun";
import {
  RESUME_STORAGE_KEY,
  itemFingerprint,
  readResumeEntry,
  writeResumeEntry,
} from "@/features/items/quiz/resumeStorage";
import { RESUME_RECOVERY_NOTICE } from "@/features/items/quiz/resumeRestore";
import { ContinueStudyingCard } from "@/features/home/ContinueStudyingCard";
import { resetStudyHotkeysPreferenceForTests } from "@/components/study/studyHotkeysPreference";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import { readGuestHistory, recordGuestCompletion, resetGuestHistoryMemoryForTests } from "@/features/guestHistory/guestHistoryStorage";

vi.mock("@/features/analytics/analyticsEvents", () => ({
  trackEventOnce: vi.fn(),
  trackEventDeferredOnce: vi.fn(),
  flushDeferredAnalyticsEvents: vi.fn(),
}));

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: { isAuthenticated: false, isLoading: false, userId: undefined as string | undefined },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mockAuth }));

vi.mock("@/api/items", () => ({ itemsApi: { getRandom: vi.fn(), getById: vi.fn(), getAll: vi.fn() } }));
vi.mock("@/api/categories", () => ({ categoriesApi: { getAll: vi.fn() } }));
vi.mock("@/api/keywords", () => ({ keywordsApi: { getKeywordDescriptions: vi.fn() } }));
vi.mock("@/api/collections", () => ({
  collectionsApi: { getItems: vi.fn(), getById: vi.fn(), getRating: vi.fn() },
}));
vi.mock("@/components/CommentsDrawer", () => ({ CommentsDrawer: () => null }));
vi.mock("@/components/ItemCollectionsModal", () => ({ default: () => null }));
vi.mock("@/components/ItemRatingsComments", () => ({ default: () => <div>ratings-and-comments</div> }));
vi.mock("@/components/ItemCollectionControls", () => ({ ItemCollectionControls: () => <div>collection-controls</div> }));

const GUID_1 = "11111111-1111-4111-8111-111111111111";
const GUID_2 = "22222222-2222-4222-8222-222222222222";
const GUID_3 = "33333333-3333-4333-8333-333333333333";
const COLLECTION_ID = "44444444-4444-4444-8444-444444444444";

const base = { category: "exams", isPrivate: false, createdAt: "2026-03-22T00:00:00Z", keywords: [], collections: [], incorrectAnswerSpeech: [] };
const item1 = { ...base, id: GUID_1, question: "What is 2 + 2?", correctAnswer: "4", incorrectAnswers: ["1", "2", "3"], explanation: "" };
const item2 = { ...base, id: GUID_2, question: "Capital of France?", correctAnswer: "Paris", incorrectAnswers: ["Rome", "Berlin", "Madrid"], explanation: "" };
const item3 = { ...base, id: GUID_3, question: "Largest planet?", correctAnswer: "Jupiter", incorrectAnswers: ["Mars", "Venus", "Saturn"], explanation: "" };
const ITEMS = [item1, item2, item3];

const PRACTICE_URL = `/quiz/collections/${COLLECTION_ID}/item/${GUID_1}`;
const TEST_URL = `${PRACTICE_URL}?mode=test`;

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderAt(initialEntry: string | { pathname: string; state?: unknown }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const page = (
    <>
      <QuizModePage />
      <LocationDisplay />
    </>
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/" element={<><ContinueStudyingCard /><LocationDisplay /></>} />
          <Route path="/quiz/collections/:collectionId/item/:itemId" element={page} />
          <Route path="/quiz/collections/:collectionId/:slug/item/:itemId" element={page} />
          <Route path="/quiz/collections/:collectionId/:slug" element={page} />
          <Route path="/quiz/collections/:collectionId" element={page} />
          <Route path="/quiz/:category/item/:itemId" element={page} />
          <Route path="/quiz/:category?" element={page} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function option(text: string): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(`^[A-D]\\. ${text}$`) });
}

function optionOrder(): string[] {
  return screen.getAllByRole("button", { name: /^[A-D]\. / }).map((button) => button.textContent ?? "");
}

/** Simulates closing and reopening the browser: the tab's sessionStorage is gone, localStorage stays. */
function restartBrowser(unmount: () => void) {
  unmount();
  sessionStorage.clear();
}

function collectionRun(mode: "practice" | "test", identity = "guest"): QuizRunState {
  return createQuizRun({ kind: "collection", collectionId: COLLECTION_ID }, [GUID_1, GUID_2, GUID_3], identity, mode);
}

function saveEntry(run: QuizRunState, fingerprints = Object.fromEntries(ITEMS.map((item) => [item.id, itemFingerprint(item)]))) {
  const search = run.mode === "test" ? "?mode=test" : "";
  expect(
    writeResumeEntry({
      identityKey: run.identityKey,
      label: "Exam",
      resumePath: `/quiz/collections/${COLLECTION_ID}/exam/item/${GUID_1}${search}`,
      startPath: `/quiz/collections/${COLLECTION_ID}/exam${search}`,
      currentIndex: 0,
      run,
      fingerprints,
    })
  ).toBe(true);
}

let published: QuizCompletionSnapshot[] = [];
const listener = (event: Event) => published.push((event as CustomEvent<QuizCompletionSnapshot>).detail);

describe("QuizModePage resume or start over (AC 3.6.24, #602)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockAuth.isAuthenticated = false;
    mockAuth.isLoading = false;
    mockAuth.userId = undefined;
    installMemoryLocalStorage();
    resetGuestHistoryMemoryForTests();
    resetStudyHotkeysPreferenceForTests();
    published = [];
    window.addEventListener(QUIZ_COMPLETED_EVENT, listener);
    vi.mocked(categoriesApi.getAll).mockResolvedValue({ categories: [{ category: "exams" }] } as Awaited<ReturnType<typeof categoriesApi.getAll>>);
    vi.mocked(itemsApi.getRandom).mockResolvedValue({ items: ITEMS } as Awaited<ReturnType<typeof itemsApi.getRandom>>);
    vi.mocked(itemsApi.getById).mockImplementation((id: string) => {
      const found = ITEMS.find((item) => item.id === id);
      return found ? Promise.resolve(found as Awaited<ReturnType<typeof itemsApi.getById>>) : Promise.reject(new Error("404"));
    });
    vi.mocked(itemsApi.getAll).mockResolvedValue({ items: [], totalCount: 3 } as unknown as Awaited<ReturnType<typeof itemsApi.getAll>>);
    vi.mocked(keywordsApi.getKeywordDescriptions).mockResolvedValue({ keywords: [] } as Awaited<ReturnType<typeof keywordsApi.getKeywordDescriptions>>);
    vi.mocked(collectionsApi.getItems).mockResolvedValue({ items: ITEMS } as Awaited<ReturnType<typeof collectionsApi.getItems>>);
    vi.mocked(collectionsApi.getById).mockResolvedValue({
      id: COLLECTION_ID,
      name: "Exam",
      description: "",
      itemCount: 3,
      createdBy: "someone",
      createdAt: "2026-10-15T00:00:00Z",
      isPublic: true,
    } as Awaited<ReturnType<typeof collectionsApi.getById>>);
    vi.mocked(collectionsApi.getRating).mockResolvedValue({ averageStars: null, count: 0, myStars: null });
  });

  afterEach(() => {
    window.removeEventListener(QUIZ_COMPLETED_EVENT, listener);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reload in the same tab restores silently, and the run is also saved in localStorage", async () => {
    const first = renderAt(PRACTICE_URL);
    await screen.findByText("What is 2 + 2?");
    const order = optionOrder();
    fireEvent.click(option("4"));
    await waitFor(() => expect(readResumeEntry("guest")?.run.outcomes[GUID_1]?.selectedAnswer).toBe("4"));
    expect(readResumeEntry("guest")?.label).toBe("Exam");
    first.unmount();

    renderAt(PRACTICE_URL);
    await screen.findByText("What is 2 + 2?");
    expect(screen.queryByText("Pick up where you left off?")).not.toBeInTheDocument();
    expect(optionOrder()).toEqual(order);
    expect(option("4")).toBeDisabled();
  });

  it("after a browser restart the page offers Resume, which restores roster, option order and answers", async () => {
    const first = renderAt(PRACTICE_URL);
    await screen.findByText("What is 2 + 2?");
    const order = optionOrder();
    fireEvent.click(option("4"));
    await waitFor(() => expect(readResumeEntry("guest")).not.toBeNull());
    const savedRunId = readResumeEntry("guest")!.run.runId;
    restartBrowser(first.unmount);

    renderAt(`/quiz/collections/${COLLECTION_ID}`);
    expect(await screen.findByRole("heading", { name: "Pick up where you left off?" })).toBeInTheDocument();
    expect(screen.getByText("Exam")).toBeInTheDocument();
    expect(screen.getByText(/Practice · 1 of 3 answered · Last studied/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));

    expect(await screen.findByText("What is 2 + 2?")).toBeInTheDocument();
    expect(optionOrder()).toEqual(order);
    expect(option("4")).toBeDisabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const stored = JSON.parse(sessionStorage.getItem("navigationContext_quiz")!) as { quizRun: QuizRunState };
    expect(stored.quizRun.runId).toBe(savedRunId);
  });

  it("Start over starts a fresh run in the same scope and mode without recording the abandoned run", async () => {
    recordGuestCompletion(
      { runId: "earlier-run", scope: { kind: "collection", collectionId: COLLECTION_ID }, completedAt: new Date().toISOString(), correct: 1, total: 1, missedItemIds: [] },
      { isAuthenticated: false, isAuthLoading: false, runIdentityKey: "guest", currentIdentityKey: "guest" }
    );
    let run = collectionRun("test");
    run = reduceQuizRun(run, { type: "start-test", startedAt: new Date().toISOString(), timeLimitSec: null });
    run = reduceQuizRun(run, { type: "answer", itemId: GUID_1, selectedAnswer: "1", isCorrect: false, completedAt: new Date().toISOString() });
    saveEntry(run);

    renderAt(TEST_URL);
    fireEvent.click(await screen.findByRole("button", { name: "Start over" }));

    expect(await screen.findByRole("heading", { name: "Test mode" })).toBeInTheDocument();
    expect(screen.getByTestId("location").textContent).toContain("mode=test");
    expect(readResumeEntry("guest")).toBeNull();
    expect(published).toHaveLength(0);
    expect(readGuestHistory().map((entry) => entry.runId)).toEqual(["earlier-run"]);
  });

  it("submits a Test whose deadline passed while the browser was closed, with one completion record", async () => {
    let run = collectionRun("test");
    run = reduceQuizRun(run, { type: "start-test", startedAt: new Date(Date.now() - 3_600_000).toISOString(), timeLimitSec: 600 });
    run = reduceQuizRun(run, { type: "answer", itemId: GUID_2, selectedAnswer: "Paris", isCorrect: true, completedAt: new Date(Date.now() - 3_500_000).toISOString() });
    saveEntry(run);

    renderAt(TEST_URL);
    expect(await screen.findByText(/Test · 1 of 3 answered · Time is up/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));

    expect(await screen.findByRole("heading", { name: "Test complete" })).toBeInTheDocument();
    expect(screen.getByText("Time ran out. Your test was submitted automatically.")).toBeInTheDocument();
    await waitFor(() => expect(readResumeEntry("guest")).toBeNull());
    expect(published).toHaveLength(1);
    expect(published[0].runId).toBe(run.runId);
    expect(readGuestHistory()).toHaveLength(1);
  });

  it("restores the Test time left and flags on Resume", async () => {
    let run = collectionRun("test");
    run = reduceQuizRun(run, { type: "start-test", startedAt: new Date(Date.now() - 120_000).toISOString(), timeLimitSec: 600 });
    run = reduceQuizRun(run, { type: "answer", itemId: GUID_1, selectedAnswer: "1", isCorrect: false, completedAt: new Date().toISOString() });
    run = reduceQuizRun(run, { type: "toggle-flag", itemId: GUID_1 });
    saveEntry(run);

    renderAt(TEST_URL);
    fireEvent.click(await screen.findByRole("button", { name: "Resume" }));
    expect(await screen.findByText("What is 2 + 2?")).toBeInTheDocument();
    expect(option("1")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Question 1, answered, flagged, current" })).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent(/Time left (8:0\d|7:5\d)/);
  });

  it("a changed question shows the recovery notice and starts fresh without results", async () => {
    let run = collectionRun("practice");
    run = reduceQuizRun(run, { type: "answer", itemId: GUID_1, selectedAnswer: "4", isCorrect: true, completedAt: new Date().toISOString() });
    saveEntry(run);
    vi.mocked(collectionsApi.getItems).mockResolvedValue({
      items: [item1, { ...item2, correctAnswer: "Lyon", incorrectAnswers: ["Rome", "Berlin", "Paris"] }, item3],
    } as Awaited<ReturnType<typeof collectionsApi.getItems>>);

    renderAt(PRACTICE_URL);
    fireEvent.click(await screen.findByRole("button", { name: "Resume" }));
    expect(await screen.findByText(RESUME_RECOVERY_NOTICE)).toBeInTheDocument();
    expect(await screen.findByText("What is 2 + 2?")).toBeInTheDocument();
    expect(option("4")).not.toBeDisabled();
    expect(readResumeEntry("guest")).toBeNull();
    expect(published).toHaveLength(0);
  });

  it("a deleted question in a category run shows the recovery notice", async () => {
    const scope = { kind: "category" as const, category: "exams", navigationKeywords: [], filterKeywords: [], quizSize: 10 };
    let run = createQuizRun(scope, [GUID_1, GUID_2], "guest");
    run = reduceQuizRun(run, { type: "answer", itemId: GUID_1, selectedAnswer: "4", isCorrect: true, completedAt: new Date().toISOString() });
    writeResumeEntry({
      identityKey: "guest",
      label: "exams",
      resumePath: `/quiz/exams/item/${GUID_1}`,
      startPath: "/quiz/exams",
      currentIndex: 0,
      run,
      fingerprints: { [GUID_1]: itemFingerprint(item1), [GUID_2]: itemFingerprint(item2) },
    });
    vi.mocked(itemsApi.getById).mockImplementation((id: string) =>
      id === GUID_1 ? Promise.resolve(item1 as Awaited<ReturnType<typeof itemsApi.getById>>) : Promise.reject(new Error("404"))
    );

    renderAt("/quiz/exams");
    fireEvent.click(await screen.findByRole("button", { name: "Resume" }));
    expect(await screen.findByText(RESUME_RECOVERY_NOTICE)).toBeInTheDocument();
    expect(screen.getByTestId("location").textContent).toMatch(/^\/quiz\/exams/);
  });

  it("resumes a category run after a restart, refetching its items by id", async () => {
    const scope = { kind: "category" as const, category: "exams", navigationKeywords: [], filterKeywords: [], quizSize: 2 };
    let run = createQuizRun(scope, [GUID_2, GUID_1], "guest");
    run = reduceQuizRun(run, { type: "answer", itemId: GUID_2, selectedAnswer: "Rome", isCorrect: false, completedAt: new Date().toISOString() });
    writeResumeEntry({
      identityKey: "guest",
      label: "exams",
      resumePath: `/quiz/exams/item/${GUID_1}`,
      startPath: "/quiz/exams?size=2",
      currentIndex: 1,
      run,
      fingerprints: { [GUID_1]: itemFingerprint(item1), [GUID_2]: itemFingerprint(item2) },
    });

    renderAt("/quiz/exams");
    fireEvent.click(await screen.findByRole("button", { name: "Resume" }));
    expect(await screen.findByText("What is 2 + 2?")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(itemsApi.getById).toHaveBeenCalledWith(GUID_1);
    expect(itemsApi.getById).toHaveBeenCalledWith(GUID_2);
    expect(itemsApi.getRandom).not.toHaveBeenCalled();
    const stored = JSON.parse(sessionStorage.getItem("navigationContext_quiz")!) as { quizRun: QuizRunState };
    expect(stored.quizRun.runId).toBe(run.runId);
    expect(stored.quizRun.outcomes[GUID_2]?.selectedAnswer).toBe("Rome");
  });

  it("never offers or clears another identity's saved run", async () => {
    let run = collectionRun("practice", "user:alice");
    run = reduceQuizRun(run, { type: "answer", itemId: GUID_1, selectedAnswer: "4", isCorrect: true, completedAt: new Date().toISOString() });
    saveEntry(run);
    mockAuth.isAuthenticated = true;
    mockAuth.userId = "bob";

    renderAt(PRACTICE_URL);
    expect(await screen.findByText("What is 2 + 2?")).toBeInTheDocument();
    expect(screen.queryByText("Pick up where you left off?")).not.toBeInTheDocument();
    expect(readResumeEntry("user:alice")?.run.runId).toBe(run.runId);
  });

  it("waits for auth to settle before reading the saved run", async () => {
    let run = collectionRun("practice", "user:alice");
    run = reduceQuizRun(run, { type: "answer", itemId: GUID_1, selectedAnswer: "4", isCorrect: true, completedAt: new Date().toISOString() });
    saveEntry(run);
    mockAuth.isLoading = true;
    const view = renderAt(PRACTICE_URL);
    expect(screen.queryByText("Pick up where you left off?")).not.toBeInTheDocument();
    mockAuth.isLoading = false;
    mockAuth.isAuthenticated = true;
    mockAuth.userId = "alice";
    view.unmount();
    renderAt(PRACTICE_URL);
    expect(await screen.findByRole("heading", { name: "Pick up where you left off?" })).toBeInTheDocument();
  });

  it("plays normally when localStorage is unavailable or corrupt", async () => {
    const storage = installMemoryLocalStorage();
    storage.setItem(RESUME_STORAGE_KEY, "{corrupt");
    renderAt(PRACTICE_URL);
    expect(await screen.findByText("What is 2 + 2?")).toBeInTheDocument();
    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    fireEvent.click(option("4"));
    expect(option("4")).toBeDisabled();
    expect(screen.queryByText("Pick up where you left off?")).not.toBeInTheDocument();
  });

  it("the home card shows the saved run, and its Resume opens the run without asking again", async () => {
    let run = collectionRun("practice");
    run = reduceQuizRun(run, { type: "answer", itemId: GUID_1, selectedAnswer: "4", isCorrect: true, completedAt: new Date().toISOString() });
    saveEntry(run);

    renderAt("/");
    expect(await screen.findByRole("heading", { name: "Continue studying" })).toBeInTheDocument();
    expect(screen.getByText(/Practice · 1 of 3 answered/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));

    expect(await screen.findByText("What is 2 + 2?")).toBeInTheDocument();
    expect(screen.queryByText("Pick up where you left off?")).not.toBeInTheDocument();
    expect(option("4")).toBeDisabled();
  });

  it("the home card's Start over opens a fresh run and removes the saved one", async () => {
    let run = collectionRun("practice");
    run = reduceQuizRun(run, { type: "answer", itemId: GUID_1, selectedAnswer: "4", isCorrect: true, completedAt: new Date().toISOString() });
    saveEntry(run);

    renderAt("/");
    fireEvent.click(await screen.findByRole("button", { name: "Start over" }));
    expect(await screen.findByText("What is 2 + 2?")).toBeInTheDocument();
    expect(option("4")).not.toBeDisabled();
    expect(readResumeEntry("guest")?.run.runId).not.toBe(run.runId);
    expect(published).toHaveLength(0);
  });

  it("the home card shows nothing while auth is loading or for another identity", () => {
    let run = collectionRun("practice", "user:alice");
    run = reduceQuizRun(run, { type: "answer", itemId: GUID_1, selectedAnswer: "4", isCorrect: true, completedAt: new Date().toISOString() });
    saveEntry(run);
    mockAuth.isLoading = true;
    const view = renderAt("/");
    expect(screen.queryByRole("heading", { name: "Continue studying" })).not.toBeInTheDocument();
    view.unmount();
    mockAuth.isLoading = false;
    renderAt("/");
    expect(screen.queryByRole("heading", { name: "Continue studying" })).not.toBeInTheDocument();
  });
});
