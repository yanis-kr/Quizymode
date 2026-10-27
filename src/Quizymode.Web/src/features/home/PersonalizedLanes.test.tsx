import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import { dailyQuizApi, interestsApi, reviewQueueApi } from "@/api/learningLoop";
import { studySessionsApi } from "@/api/studySessions";
import type { FeaturedSetDto } from "@/api/featured";
import { PersonalizedLanes } from "./PersonalizedLanes";
import { readLocalInterests, recordLocalDailyCompletion, utcToday } from "@/features/learningLoop/localLearningState";
import { renderWithProviders } from "@/features/learningLoop/learningLoopTestUtils";

const auth = vi.hoisted(() => ({ value: { isAuthenticated: false, isLoading: false, userId: null as string | null } }));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth.value }));
vi.mock("@/api/learningLoop", () => ({
  dailyQuizApi: { get: vi.fn() },
  reviewQueueApi: { getSummary: vi.fn() },
  interestsApi: { get: vi.fn(), replace: vi.fn(), popularCategories: vi.fn() },
}));
vi.mock("@/api/studySessions", () => ({ studySessionsApi: { list: vi.fn() } }));
vi.mock("@/api/collections", () => ({ collectionsApi: { getById: vi.fn().mockResolvedValue({ name: "Tennis Trivia" }) } }));

const featured: FeaturedSetDto[] = [
  { id: "f1", displayName: "World Cup Starter", categorySlug: "trivia", navKeyword1: "sports", navKeyword2: null, itemCount: 10, lastModifiedAt: null, sortOrder: 1 },
  { id: "f2", displayName: "Solar System Sprint", categorySlug: "science", navKeyword1: "space", navKeyword2: null, itemCount: 10, lastModifiedAt: null, sortOrder: 2 },
];

describe("PersonalizedLanes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMemoryLocalStorage();
    auth.value = { isAuthenticated: false, isLoading: false, userId: null };
    vi.mocked(interestsApi.popularCategories).mockResolvedValue(["science"]);
  });

  it("anonymous cold start: daily card, popular sets, and topics saved in this browser", async () => {
    renderWithProviders(<PersonalizedLanes featuredSets={featured} />);

    expect(screen.getByRole("link", { name: /Daily quiz/ })).toHaveAttribute("href", "/daily");
    expect(screen.queryByRole("link", { name: /Review mistakes/ })).not.toBeInTheDocument();
    expect(await screen.findByText("Popular right now")).toBeInTheDocument();
    // Before the popular list arrives the catalog order is shown; popular categories then move to the front.
    await waitFor(() =>
      expect(screen.getAllByRole("link", { name: /Solar System Sprint|World Cup Starter/ })[0]).toHaveTextContent("Solar System Sprint"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose topics" }));
    const dialog = screen.getByRole("dialog", { name: "Choose your topics" });
    fireEvent.click(within(dialog).getByLabelText("Trivia"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save topics" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(readLocalInterests()).toEqual(["trivia"]);
    expect(interestsApi.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Trivia" })).toHaveAttribute("href", "/categories/trivia");
    expect(screen.getByText("Recommended next")).toBeInTheDocument();
  });

  it("anonymous: shows the local streak once today's daily quiz is done", () => {
    recordLocalDailyCompletion({ date: utcToday(), correct: 3, total: 5 });

    renderWithProviders(<PersonalizedLanes featuredSets={[]} />);

    expect(screen.getByRole("link", { name: /Daily quiz/ })).toHaveTextContent("Done for today");
    expect(screen.getByRole("link", { name: /Daily quiz/ })).toHaveTextContent("1-day streak");
  });

  it("signed in: review card, Continue from saved sessions, and topics saved to the account", async () => {
    auth.value = { isAuthenticated: true, isLoading: false, userId: "user-1" };
    vi.mocked(interestsApi.get).mockResolvedValue(["history"]);
    vi.mocked(interestsApi.replace).mockResolvedValue(["history", "trivia"]);
    vi.mocked(reviewQueueApi.getSummary).mockResolvedValue({ dueCount: 4, totalCount: 9, nextDueAt: null });
    vi.mocked(dailyQuizApi.get).mockResolvedValue({ date: utcToday(), items: [], completion: null, streak: 5 });
    vi.mocked(studySessionsApi.list).mockResolvedValue([
      {
        id: "s1",
        origin: "quiz",
        runId: "run-1",
        completedAt: new Date().toISOString(),
        correct: 3,
        total: 5,
        source: { kind: "category", categorySlug: "trivia", navigationKeywords: ["sports"], filterKeywords: [] },
        missedItemIds: [],
      },
    ]);

    renderWithProviders(<PersonalizedLanes featuredSets={featured} />);

    expect(await screen.findByRole("link", { name: /Review mistakes/ })).toHaveTextContent("4 questions due");
    expect(await screen.findByRole("heading", { name: "Continue" })).toBeInTheDocument();
    expect(await screen.findByText(/5-day streak/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "History" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit topics" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByLabelText("Trivia"));
    fireEvent.click(screen.getByRole("button", { name: "Save topics" }));

    await waitFor(() => expect(interestsApi.replace).toHaveBeenCalledWith(["history", "trivia"]));
    expect(readLocalInterests()).toEqual([]);
  });

  it("Continue opens Learn for learn sessions and Quiz otherwise", async () => {
    auth.value = { isAuthenticated: true, isLoading: false, userId: "user-1" };
    vi.mocked(interestsApi.get).mockResolvedValue([]);
    vi.mocked(reviewQueueApi.getSummary).mockResolvedValue({ dueCount: 0, totalCount: 0, nextDueAt: null });
    vi.mocked(dailyQuizApi.get).mockResolvedValue({ date: utcToday(), items: [], completion: null, streak: 0 });
    const base = { origin: "quiz", correct: 3, total: 5, missedItemIds: [] };
    vi.mocked(studySessionsApi.list).mockResolvedValue([
      {
        ...base,
        id: "s1",
        runId: "run-1",
        completedAt: new Date().toISOString(),
        mode: "learn",
        source: { kind: "category", categorySlug: "trivia", navigationKeywords: ["sports"], filterKeywords: [] },
      },
      {
        ...base,
        id: "s2",
        runId: "run-2",
        completedAt: new Date(Date.now() - 60_000).toISOString(),
        source: { kind: "category", categorySlug: "science", navigationKeywords: ["space"], filterKeywords: [] },
      },
    ]);

    renderWithProviders(<PersonalizedLanes featuredSets={featured} />);
    await screen.findByRole("heading", { name: "Continue" });
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("/learn/trivia?nav=sports&keywords=sports");
    expect(hrefs).toContain("/quiz/science?nav=space&keywords=space");
  });

  it("keeps the picker open with an error when saving fails", async () => {
    auth.value = { isAuthenticated: true, isLoading: false, userId: "user-1" };
    vi.mocked(interestsApi.get).mockResolvedValue([]);
    vi.mocked(interestsApi.replace).mockRejectedValue(new Error("down"));
    vi.mocked(reviewQueueApi.getSummary).mockResolvedValue({ dueCount: 0, totalCount: 0, nextDueAt: null });
    vi.mocked(dailyQuizApi.get).mockResolvedValue({ date: utcToday(), items: [], completion: null, streak: 0 });
    vi.mocked(studySessionsApi.list).mockResolvedValue([]);

    renderWithProviders(<PersonalizedLanes featuredSets={featured} />);
    fireEvent.click(await screen.findByRole("button", { name: "Choose topics" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save topics" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Save topics" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Your topics could not be saved.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  const signedInQuietLanes = () => {
    auth.value = { isAuthenticated: true, isLoading: false, userId: "user-1" };
    vi.mocked(reviewQueueApi.getSummary).mockResolvedValue({ dueCount: 0, totalCount: 0, nextDueAt: null });
    vi.mocked(dailyQuizApi.get).mockResolvedValue({ date: utcToday(), items: [], completion: null, streak: 0 });
    vi.mocked(studySessionsApi.list).mockResolvedValue([]);
  };

  it("#380: a failed topics load never lets Save replace the saved topics, and Retry prefills them", async () => {
    signedInQuietLanes();
    vi.mocked(interestsApi.get).mockRejectedValueOnce(new Error("down")).mockResolvedValue(["history"]);
    vi.mocked(interestsApi.replace).mockResolvedValue([]);

    renderWithProviders(<PersonalizedLanes featuredSets={featured} />);
    await waitFor(() => expect(interestsApi.get).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole("button", { name: "Choose topics" }));
    const dialog = screen.getByRole("dialog", { name: "Choose your topics" });

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Your topics could not be loaded.");
    expect(within(dialog).queryByLabelText("History")).not.toBeInTheDocument();
    const save = within(dialog).getByRole("button", { name: "Save topics" });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(interestsApi.replace).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Retry" }));
    expect(await within(dialog).findByLabelText("History")).toBeChecked();
    // Retry disappears with the error, so focus moves to the first chip instead of dropping to the page.
    expect(within(dialog).getAllByRole("checkbox")[0]).toHaveFocus();
    expect(within(dialog).getByRole("button", { name: "Save topics" })).toBeEnabled();
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    expect(interestsApi.replace).not.toHaveBeenCalled();
  });

  it("#380: opened while topics load, the picker waits and then prefills them", async () => {
    signedInQuietLanes();
    let resolve: (value: string[]) => void = () => {};
    vi.mocked(interestsApi.get).mockReturnValue(new Promise<string[]>((r) => (resolve = r)));

    renderWithProviders(<PersonalizedLanes featuredSets={featured} />);
    fireEvent.click(await screen.findByRole("button", { name: "Choose topics" }));
    const dialog = screen.getByRole("dialog", { name: "Choose your topics" });

    expect(within(dialog).getByRole("status")).toHaveTextContent("Loading your topics…");
    expect(within(dialog).getByRole("button", { name: "Save topics" })).toBeDisabled();

    resolve(["history"]);
    expect(await within(dialog).findByLabelText("History")).toBeChecked();
    expect(within(dialog).getByRole("button", { name: "Save topics" })).toBeEnabled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
