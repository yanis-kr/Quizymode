import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import QuizModePage from "./QuizModePage";
import { itemsApi } from "@/api/items";
import { categoriesApi } from "@/api/categories";
import { keywordsApi } from "@/api/keywords";
import { collectionsApi } from "@/api/collections";
import { createQuizRun, type QuizRunState } from "@/features/items/quiz/quizRun";
import { resetStudyHotkeysPreferenceForTests } from "@/components/study/studyHotkeysPreference";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import { resetGuestHistoryMemoryForTests } from "@/features/guestHistory/guestHistoryStorage";

const { mockTrackEventOnce, mockTrackEventDeferredOnce, mockFlushDeferredAnalyticsEvents } = vi.hoisted(() => ({
  mockTrackEventOnce: vi.fn(),
  mockTrackEventDeferredOnce: vi.fn(),
  mockFlushDeferredAnalyticsEvents: vi.fn(),
}));

vi.mock("@/features/analytics/analyticsEvents", () => ({
  trackEventOnce: mockTrackEventOnce,
  trackEventDeferredOnce: mockTrackEventDeferredOnce,
  flushDeferredAnalyticsEvents: mockFlushDeferredAnalyticsEvents,
}));

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: { isAuthenticated: false, isLoading: false, userId: undefined as string | undefined },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

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

const GUID_2 = "22222222-2222-4222-8222-222222222222";
const GUID_3 = "33333333-3333-4333-8333-333333333333";
const GUID_4 = "55555555-5555-4555-8555-555555555555";
const COLLECTION_ID = "44444444-4444-4444-8444-444444444444";
const IDENTITY = "guest";

const base = {
  category: "exams",
  isPrivate: false,
  createdAt: "2026-03-22T00:00:00Z",
  keywords: [],
  collections: [],
  incorrectAnswerSpeech: [],
};
const paris = { ...base, id: GUID_2, question: "Capital of France?", correctAnswer: "Paris", incorrectAnswers: ["Rome", "Berlin", "Madrid"], explanation: "Paris it is." };
const sentence = { ...base, id: GUID_4, question: "Name the sentence", correctAnswer: "The quick brown fox jumps", incorrectAnswers: ["A", "B", "C"], explanation: "Pangram." };
const jupiter = { ...base, id: GUID_3, question: "Largest planet?", correctAnswer: "Jupiter", incorrectAnswers: ["Mars", "Venus", "Saturn"], explanation: "Gas giant." };

const START = `/quiz/collections/${COLLECTION_ID}/item/${GUID_2}`;
const TEST_START = `${START}?mode=test`;

function renderPage(initialEntry: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/quiz/collections/:collectionId/item/:itemId" element={<QuizModePage />} />
          <Route path="/quiz/collections/:collectionId/:slug/item/:itemId" element={<QuizModePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function questionAnswered(): { itemId: string; isCorrect: boolean }[] {
  return mockTrackEventDeferredOnce.mock.calls
    .map((call) => call[1] as { name: string; itemId: string; isCorrect: boolean })
    .filter((event) => event.name === "question_answered");
}

function storedOutcomes(): QuizRunState["outcomes"] {
  const raw = JSON.parse(sessionStorage.getItem("navigationContext_quiz") ?? "{}") as { quizRun?: QuizRunState };
  return raw.quizRun?.outcomes ?? {};
}

function typeAndCheck(text: string): void {
  fireEvent.change(screen.getByLabelText("Type your answer"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
}

describe("QuizModePage Type answer (AC 3.6.19)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockAuth.isAuthenticated = false;
    mockAuth.userId = undefined;
    installMemoryLocalStorage();
    resetGuestHistoryMemoryForTests();
    resetStudyHotkeysPreferenceForTests();
    vi.mocked(categoriesApi.getAll).mockResolvedValue({ categories: [{ category: "exams" }] } as Awaited<ReturnType<typeof categoriesApi.getAll>>);
    vi.mocked(itemsApi.getRandom).mockResolvedValue({ items: [paris] } as Awaited<ReturnType<typeof itemsApi.getRandom>>);
    vi.mocked(keywordsApi.getKeywordDescriptions).mockResolvedValue({ keywords: [] } as Awaited<ReturnType<typeof keywordsApi.getKeywordDescriptions>>);
    vi.mocked(collectionsApi.getItems).mockResolvedValue({ items: [paris, sentence, jupiter] } as Awaited<ReturnType<typeof collectionsApi.getItems>>);
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
    vi.restoreAllMocks();
  });

  it("offers an unchecked Type answer toggle for a typeable item and keeps multiple choice", async () => {
    renderPage(START);

    expect(await screen.findByText("Capital of France?")).toBeInTheDocument();
    expect(screen.getByLabelText("Type answer")).not.toBeChecked();
    expect(screen.getByRole("button", { name: /^A\./ })).toBeInTheDocument();
    expect(screen.queryByLabelText("Type your answer")).not.toBeInTheDocument();
  });

  it("grades a typed answer leniently, shows a polite result and records it as typed", async () => {
    renderPage(START);
    await screen.findByText("Capital of France?");

    fireEvent.click(screen.getByLabelText("Type answer"));
    expect(screen.queryByRole("button", { name: /^A\./ })).not.toBeInTheDocument();
    const input = screen.getByLabelText("Type your answer");
    expect(input).toHaveAttribute("autocorrect", "off");
    expect(input).toHaveAttribute("autocapitalize", "off");
    expect(input).toHaveAttribute("spellcheck", "false");
    typeAndCheck("  pariss ");

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Correct. Accepted answer: Paris");
    expect(screen.queryByRole("button", { name: "I was right" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    await waitFor(() =>
      expect(storedOutcomes()[GUID_2]).toMatchObject({ selectedAnswer: "pariss", isCorrect: true, inputMode: "typed" })
    );
    expect(questionAnswered()).toEqual([expect.objectContaining({ itemId: GUID_2, isCorrect: true })]);
  });

  it("submits on Enter and reports an incorrect answer with the accepted answer before it locks", async () => {
    renderPage(START);
    await screen.findByText("Capital of France?");

    fireEvent.click(screen.getByLabelText("Type answer"));
    const input = screen.getByLabelText("Type your answer");
    fireEvent.change(input, { target: { value: "Rome" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByRole("status")).toHaveTextContent("Incorrect. Accepted answer: Paris");
    expect(screen.getByRole("button", { name: "I was right" })).toBeInTheDocument();
    expect(storedOutcomes()[GUID_2]).toBeUndefined();
  });

  it("I was right flips an incorrect typed answer to correct before it locks", async () => {
    renderPage(START);
    await screen.findByText("Capital of France?");

    fireEvent.click(screen.getByLabelText("Type answer"));
    typeAndCheck("Rome");
    fireEvent.click(screen.getByRole("button", { name: "I was right" }));

    expect(screen.getByRole("status")).toHaveTextContent("Correct.");
    expect(screen.queryByRole("button", { name: "I was right" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    await waitFor(() =>
      expect(storedOutcomes()[GUID_2]).toMatchObject({ isCorrect: true, inputMode: "typed", selectedAnswer: "Rome" })
    );
    expect(questionAnswered()).toEqual([expect.objectContaining({ itemId: GUID_2, isCorrect: true })]);
  });

  it("shows a note and stays multiple choice for a non-typeable item", async () => {
    renderPage(START);
    await screen.findByText("Capital of France?");
    fireEvent.click(screen.getByRole("button", { name: /^[A-D]\. Paris$/ }));
    expect(storedOutcomes()[GUID_2]).toMatchObject({ isCorrect: true, inputMode: "choice" });
    fireEvent.click(screen.getByTitle("Next item"));

    expect(await screen.findByText("Name the sentence")).toBeInTheDocument();
    expect(screen.queryByLabelText("Type answer")).not.toBeInTheDocument();
    expect(screen.getByText("This answer is too long to type, so choose an option.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^A\./ })).toBeInTheDocument();
  });

  it("records a held typed answer when the learner navigates away without Continue", async () => {
    renderPage(START);
    await screen.findByText("Capital of France?");

    fireEvent.click(screen.getByLabelText("Type answer"));
    typeAndCheck("Rome");
    fireEvent.click(screen.getByTitle("Next item"));

    await waitFor(() => expect(storedOutcomes()[GUID_2]).toMatchObject({ isCorrect: false, inputMode: "typed" }));
  });

  it("shows a restored typed answer as locked, with no override or toggle", async () => {
    const run = createQuizRun({ kind: "collection", collectionId: COLLECTION_ID }, [GUID_2, GUID_4, GUID_3], IDENTITY);
    const stored: QuizRunState = {
      ...run,
      outcomes: { [GUID_2]: { itemId: GUID_2, selectedAnswer: "Rome", isCorrect: false, inputMode: "typed" } },
    };
    sessionStorage.setItem(
      "navigationContext_quiz",
      JSON.stringify({ mode: "quiz", collectionId: COLLECTION_ID, currentIndex: 0, itemIds: stored.itemIds, quizRun: stored })
    );
    renderPage(START);

    expect(await screen.findByLabelText("Type your answer")).toHaveValue("Rome");
    expect(screen.getByRole("status")).toHaveTextContent("Incorrect. Accepted answer: Paris");
    expect(screen.queryByRole("button", { name: "I was right" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Type answer")).not.toBeInTheDocument();
  });

  it("does not offer Type answer in Test mode", async () => {
    renderPage(TEST_START);
    await screen.findByRole("heading", { name: "Test mode" });
    fireEvent.click(screen.getByRole("button", { name: "Start test" }));

    expect(await screen.findByText("Capital of France?")).toBeInTheDocument();
    expect(screen.queryByLabelText("Type answer")).not.toBeInTheDocument();
    expect(screen.queryByText(/too long to type/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^A\./ })).toBeInTheDocument();
  });
});
