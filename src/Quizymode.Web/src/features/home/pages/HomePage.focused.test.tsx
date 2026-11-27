import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import HomePage from "./HomePage";
import { categoriesApi } from "@/api/categories";
import { collectionsApi } from "@/api/collections";
import { featuredApi } from "@/api/featured";
import { interestsApi } from "@/api/learningLoop";
import { usersApi } from "@/api/users";
import { studySessionsApi } from "@/api/studySessions";
import { studyPlansApi } from "@/api/studyPlans";
import { topicActivityApi } from "@/api/topicActivity";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import { renderWithProviders } from "@/features/learningLoop/learningLoopTestUtils";
import { writeLocalInterests } from "@/features/learningLoop/localLearningState";

// Layout rules for the personalized Home (#382). The base HomePage.test.tsx covers the default (guest, no topics) page.
const auth = vi.hoisted(() => ({
  value: { isAuthenticated: false, isLoading: false, userId: null as string | null },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth.value }));
vi.mock("@/api/categories", () => ({ categoriesApi: { getAll: vi.fn() } }));
vi.mock("@/api/collections", () => ({ collectionsApi: { discover: vi.fn(), getById: vi.fn() } }));
vi.mock("@/api/featured", () => ({ featuredApi: { get: vi.fn() } }));
vi.mock("@/api/users", () => ({ usersApi: { getSettings: vi.fn(), updateSetting: vi.fn() } }));
vi.mock("@/api/studyPlans", () => ({ studyPlansApi: { list: vi.fn(), upsert: vi.fn(), remove: vi.fn() } }));
vi.mock("@/api/studySessions", () => ({
  MAX_SET_PROGRESS_SCOPES: 12,
  studySessionsApi: { list: vi.fn(), getSetProgress: vi.fn().mockResolvedValue({ scopes: [] }) },
}));
vi.mock("@/api/topicActivity", () => ({
  topicActivityApi: { get: vi.fn().mockResolvedValue({ windowDays: 30, topics: [] }) },
}));
vi.mock("@/api/learningLoop", () => ({
  interestsApi: { popularCategories: vi.fn(), get: vi.fn(), replace: vi.fn() },
  dailyQuizApi: { get: vi.fn() },
  reviewQueueApi: { getSummary: vi.fn() },
}));

const hero = () => screen.getByRole("heading", { name: /learn something new in five questions/i });
const exploreSummary = () => screen.getByText("Explore all topics").closest("summary")!;

function headingOrder(): string[] {
  return screen
    .getAllByRole("heading", { level: 2 })
    .map((heading) => heading.textContent ?? "")
    .filter((text) => ["Today", "Continue", "For you", "Make Home yours"].includes(text));
}

describe("HomePage personalized layout (#382)", () => {
  it("#383: a refined choice keeps its full branch in topic and game links", async () => {
    writeLocalInterests(["languages/french/core"]);
    renderWithProviders(<HomePage />);
    expect(await screen.findByRole("link", { name: "Languages › French › Core" })).toHaveAttribute("href", "/categories/languages/french/core");
    expect(screen.getByRole("link", { name: "Play a game in Languages › French › Core" })).toHaveAttribute("href", "/games/languages?nav=french%2Ccore");
  });
  beforeEach(async () => {
    vi.clearAllMocks();
    installMemoryLocalStorage();
    window.sessionStorage.clear();
    auth.value = { isAuthenticated: false, isLoading: false, userId: null };
    vi.mocked(categoriesApi.getAll).mockResolvedValue({ categories: [] });
    vi.mocked(collectionsApi.discover).mockResolvedValue({ items: [], totalCount: 0 });
    vi.mocked(featuredApi.get).mockResolvedValue({ sets: [], collections: [] });
    vi.mocked(interestsApi.popularCategories).mockResolvedValue([]);
    vi.mocked(studySessionsApi.list).mockResolvedValue([]);
    vi.mocked(studyPlansApi.list).mockResolvedValue([]);
    vi.mocked(usersApi.getSettings).mockResolvedValue({ settings: {} });
    const { dailyQuizApi, reviewQueueApi } = await import("@/api/learningLoop");
    vi.mocked(dailyQuizApi.get).mockResolvedValue({ date: "2026-10-27", items: [], completion: null, streak: 0 });
    vi.mocked(reviewQueueApi.getSummary).mockResolvedValue({ dueCount: 0, totalCount: 0, nextDueAt: null });
  });

  it("guest with local topics gets the focused Home: compact hero, lanes in order, game link, collapsed catalog", async () => {
    writeLocalInterests(["science", "history"]);
    renderWithProviders(<HomePage />);

    expect(hero()).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /play a 5-question quiz/i })).toBeInTheDocument();
    expect(screen.getByText(/no account needed/i)).toBeInTheDocument();
    expect(screen.queryByText(/five quick questions, from flags to space to AI/i)).not.toBeInTheDocument();
    expect(headingOrder()).toEqual(["Today", "For you"]);

    const game = screen.getByRole("link", { name: /Play a game in Science/ });
    expect(game).toHaveAttribute("href", "/games/science");

    const details = exploreSummary().closest("details")!;
    expect(details).not.toHaveAttribute("open");
    expect(within(details).getByText("Categories")).toBeInTheDocument();
    // The Explore section comes after the For-you lane and the game link.
    const order = [screen.getByRole("heading", { name: "For you" }), game, details];
    order.slice(1).forEach((node, index) => {
      expect(order[index].compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
    expect(screen.queryByRole("region", { name: "Make Home yours" })).not.toBeInTheDocument();
  });

  it("guest with no topics keeps the full Home and never sees the onboarding card", async () => {
    renderWithProviders(<HomePage />);

    expect(screen.getByText(/five quick questions, from flags to space to AI/i)).toBeInTheDocument();
    expect(screen.queryByText("Explore all topics")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Play a game in/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "For you" })).toBeInTheDocument();
    expect(screen.getByText("Categories")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole("region", { name: "Make Home yours" })).not.toBeInTheDocument();
  });

  it("signed in while topics load: hero stays, a pending skeleton replaces the lanes", async () => {
    auth.value = { isAuthenticated: true, isLoading: false, userId: "user-1" };
    vi.mocked(interestsApi.get).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<HomePage />);

    expect(hero()).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /play a 5-question quiz/i })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading your home");
    expect(screen.queryByRole("heading", { name: "Today" })).not.toBeInTheDocument();
    expect(screen.queryByText("Categories")).not.toBeInTheDocument();
  });

  it("auth still loading with no local picks is pending below the hero", () => {
    auth.value = { isAuthenticated: false, isLoading: true, userId: null };
    renderWithProviders(<HomePage />);

    expect(hero()).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading your home");
  });

  it("signed in with topics: focused Home, then the pending state resolves", async () => {
    auth.value = { isAuthenticated: true, isLoading: false, userId: "user-1" };
    vi.mocked(interestsApi.get).mockResolvedValue(["history"]);
    renderWithProviders(<HomePage />);

    expect(await screen.findByText("Explore all topics")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText(/no account needed/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Play a game in History/ })).toHaveAttribute("href", "/games/history");
  });

  it("signed in cold start (no topics): full Home with the onboarding card above Today", async () => {
    auth.value = { isAuthenticated: true, isLoading: false, userId: "user-1" };
    vi.mocked(interestsApi.get).mockResolvedValue([]);
    // For you needs something to show while the card holds the only topic prompt (#903).
    vi.mocked(featuredApi.get).mockResolvedValue({
      sets: [{ id: "f1", displayName: "Guess the Flag", categorySlug: "geography", navKeyword1: "flags", navKeyword2: null, itemCount: 10, lastModifiedAt: null, sortOrder: 1 }],
      collections: [],
    });
    renderWithProviders(<HomePage />);

    expect(await screen.findByRole("region", { name: "Make Home yours" })).toBeInTheDocument();
    await screen.findByRole("heading", { name: "For you" });
    expect(headingOrder()).toEqual(["Make Home yours", "Today", "For you"]);
    expect(screen.getByText(/five quick questions, from flags to space to AI/i)).toBeInTheDocument();
    expect(screen.queryByText("Explore all topics")).not.toBeInTheDocument();
  });

  it("a failed topics load falls back to the full Home without the onboarding card", async () => {
    auth.value = { isAuthenticated: true, isLoading: false, userId: "user-1" };
    vi.mocked(interestsApi.get).mockRejectedValue(new Error("down"));
    renderWithProviders(<HomePage />);

    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(screen.getByText(/five quick questions, from flags to space to AI/i)).toBeInTheDocument();
    expect(screen.getByText("Categories")).toBeInTheDocument();
    expect(screen.queryByText("Explore all topics")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Make Home yours" })).not.toBeInTheDocument();
    // The error settles the layout: no pending/full loop, so the GET is not hammered.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(vi.mocked(interestsApi.get).mock.calls.length).toBeLessThanOrEqual(3);
    const settledCalls = vi.mocked(interestsApi.get).mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(interestsApi.get).toHaveBeenCalledTimes(settledCalls);
  });

  it("a later Home mount refetches a failed topics load and recovers into the focused layout", async () => {
    auth.value = { isAuthenticated: true, isLoading: false, userId: "user-1" };
    let failing = true;
    vi.mocked(interestsApi.get).mockImplementation(() => (failing ? Promise.reject(new Error("down")) : Promise.resolve(["history"])));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = (
      <HelmetProvider>
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <HomePage />
          </MemoryRouter>
        </QueryClientProvider>
      </HelmetProvider>
    );
    const first = render(tree);
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(screen.queryByText("Explore all topics")).not.toBeInTheDocument();
    first.unmount();
    failing = false;

    render(tree);
    expect(await screen.findByText("Explore all topics")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Play a game in History/ })).toBeInTheDocument();
  });

  it("signed in focused Home keeps Continue between Today and For you", async () => {
    auth.value = { isAuthenticated: true, isLoading: false, userId: "user-1" };
    vi.mocked(interestsApi.get).mockResolvedValue(["history"]);
    vi.mocked(studySessionsApi.list).mockResolvedValue([
      {
        id: "s1",
        origin: "quiz",
        runId: "run-1",
        completedAt: new Date().toISOString(),
        correct: 3,
        total: 5,
        source: { kind: "category", categorySlug: "science", navigationKeywords: [], filterKeywords: [] },
        missedItemIds: [],
      },
    ]);
    renderWithProviders(<HomePage />);

    await screen.findByRole("heading", { name: "Continue" });
    expect(headingOrder()).toEqual(["Today", "Continue", "For you"]);
  });

  it("signed in focused Home shows test-date plan cards inside Today, before the daily quiz", async () => {
    auth.value = { isAuthenticated: true, isLoading: false, userId: "user-1" };
    vi.mocked(interestsApi.get).mockResolvedValue(["history"]);
    const testDate = new Date();
    testDate.setDate(testDate.getDate() + 4);
    vi.mocked(studyPlansApi.list).mockResolvedValue([
      {
        collectionId: "00000000-0000-4000-8000-000000000001",
        available: true,
        collectionName: "Spanish basics",
        itemCount: 10,
        testDate: `${testDate.getFullYear()}-${String(testDate.getMonth() + 1).padStart(2, "0")}-${String(testDate.getDate()).padStart(2, "0")}`,
        createdAt: new Date().toISOString(),
        firstLearnAt: null,
        lastActivityAt: null,
      },
    ]);
    renderWithProviders(<HomePage />);

    const card = await screen.findByRole("link", { name: /Learn the basics/ });
    expect(card).toHaveTextContent("Spanish basics · Test in 4 days");
    expect(card.compareDocumentPosition(screen.getByRole("link", { name: /Daily quiz/ })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(headingOrder()).toEqual(["Today", "For you"]);
  });

  it("AC 3.0.36 keeps the Fun expressions card inside Explore all topics", async () => {
    writeLocalInterests(["science"]);
    renderWithProviders(<HomePage />);

    const details = exploreSummary().closest("details")!;
    expect(await within(details).findByRole("link", { name: /Fun expressions/ })).toBeInTheDocument();
  });
});

describe("HomePage signed-in topic prompts (#903)", () => {
  const flagSet = {
    id: "f1",
    displayName: "Guess the Flag",
    categorySlug: "geography",
    navKeyword1: "flags",
    navKeyword2: null,
    itemCount: 10,
    lastModifiedAt: null,
    sortOrder: 1,
  };
  const sentence = () => screen.queryByText("Choose a few topics and we'll put them first.");
  const changeTopics = () => screen.queryByRole("button", { name: "Change topics" });
  const forYou = () => screen.queryByRole("heading", { name: "For you" });
  const card = () => screen.queryByRole("region", { name: "Make Home yours" });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

  beforeEach(async () => {
    vi.clearAllMocks();
    installMemoryLocalStorage();
    window.sessionStorage.clear();
    auth.value = { isAuthenticated: true, isLoading: false, userId: "user-1" };
    vi.mocked(categoriesApi.getAll).mockResolvedValue({ categories: [] });
    vi.mocked(collectionsApi.discover).mockResolvedValue({ items: [], totalCount: 0 });
    vi.mocked(featuredApi.get).mockResolvedValue({ sets: [], collections: [] });
    vi.mocked(interestsApi.get).mockResolvedValue([]);
    vi.mocked(interestsApi.popularCategories).mockResolvedValue([]);
    vi.mocked(studySessionsApi.list).mockResolvedValue([]);
    vi.mocked(studyPlansApi.list).mockResolvedValue([]);
    vi.mocked(topicActivityApi.get).mockResolvedValue({ windowDays: 30, topics: [] });
    vi.mocked(usersApi.getSettings).mockResolvedValue({ settings: {} });
    vi.mocked(usersApi.updateSetting).mockResolvedValue({ key: "TopicOnboarding", value: "dismissed", updatedAt: "" });
    const { dailyQuizApi, reviewQueueApi } = await import("@/api/learningLoop");
    vi.mocked(dailyQuizApi.get).mockResolvedValue({ date: "2026-10-27", items: [], completion: null, streak: 0 });
    vi.mocked(reviewQueueApi.getSummary).mockResolvedValue({ dueCount: 0, totalCount: 0, nextDueAt: null });
  });

  it.each([
    ["full", [] as string[]],
    ["focused", ["history"]],
  ])("AC1: the signed-in %s Home never says No account needed", async (layout, topics) => {
    vi.mocked(interestsApi.get).mockResolvedValue(topics);
    renderWithProviders(<HomePage />);

    if (layout === "focused") await screen.findByText("Explore all topics");
    else await screen.findByRole("region", { name: "Make Home yours" });
    expect(hero()).toBeInTheDocument();
    expect(screen.queryByText("No account needed.")).not.toBeInTheDocument();
  });

  it.each([
    ["full", [] as string[]],
    ["focused", ["history"]],
  ])("AC1: the anonymous %s Home still says No account needed", (_layout, topics) => {
    auth.value = { isAuthenticated: false, isLoading: false, userId: null };
    if (topics.length > 0) writeLocalInterests(topics);
    renderWithProviders(<HomePage />);

    expect(screen.getByText("No account needed.")).toBeInTheDocument();
  });

  it("AC2: while the Make Home yours card is shown it is the only topic prompt", async () => {
    vi.mocked(featuredApi.get).mockResolvedValue({ sets: [flagSet], collections: [] });
    renderWithProviders(<HomePage />);

    expect(await screen.findByRole("region", { name: "Make Home yours" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "For you" })).toBeInTheDocument();
    expect(sentence()).not.toBeInTheDocument();
    expect(changeTopics()).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose topics" })).toBeInTheDocument();
  });

  it("AC3: For you is not rendered when it has nothing else to show", async () => {
    renderWithProviders(<HomePage />);

    expect(await screen.findByRole("region", { name: "Make Home yours" })).toBeInTheDocument();
    await settle();
    expect(forYou()).not.toBeInTheDocument();
    expect(sentence()).not.toBeInTheDocument();
    expect(changeTopics()).not.toBeInTheDocument();
  });

  it("AC3: topic links keep the For you section under its heading", async () => {
    vi.mocked(studySessionsApi.list).mockResolvedValue([
      {
        id: "s1",
        origin: "quiz",
        runId: "run-1",
        completedAt: new Date().toISOString(),
        correct: 3,
        total: 5,
        source: { kind: "category", categorySlug: "science", navigationKeywords: [], filterKeywords: [] },
        missedItemIds: [],
      },
    ]);
    renderWithProviders(<HomePage />);

    const section = await screen.findByRole("region", { name: "For you" });
    expect(within(section).getByRole("link", { name: "Science" })).toHaveAttribute("href", "/categories/science");
    expect(await screen.findByRole("region", { name: "Make Home yours" })).toBeInTheDocument();
    expect(changeTopics()).not.toBeInTheDocument();
  });

  it("AC3: a suggestion card keeps the For you section under its heading", async () => {
    vi.mocked(topicActivityApi.get).mockResolvedValue({
      windowDays: 30,
      topics: [{ path: "science", runs: 2, lastCompletedAt: new Date().toISOString() }],
    });
    renderWithProviders(<HomePage />);

    const section = await screen.findByRole("region", { name: "For you" });
    expect(await within(section).findByRole("group", { name: "Topic suggestion" })).toBeInTheDocument();
    expect(card()).toBeInTheDocument();
    expect(sentence()).not.toBeInTheDocument();
    expect(changeTopics()).not.toBeInTheDocument();
  });

  it("AC3: a set list keeps the For you section under its heading", async () => {
    vi.mocked(featuredApi.get).mockResolvedValue({ sets: [flagSet], collections: [] });
    renderWithProviders(<HomePage />);

    const section = await screen.findByRole("region", { name: "For you" });
    expect(within(section).getByRole("heading", { name: "Popular right now" })).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: /Guess the Flag/ })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Make Home yours" })).toBeInTheDocument();
    expect(sentence()).not.toBeInTheDocument();
    expect(changeTopics()).not.toBeInTheDocument();
  });

  it("AC4: no For you prompt while the TopicOnboarding setting is loading", async () => {
    vi.mocked(usersApi.getSettings).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<HomePage />);

    await waitFor(() => expect(usersApi.getSettings).toHaveBeenCalled());
    await settle();
    expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(card()).not.toBeInTheDocument();
    expect(sentence()).not.toBeInTheDocument();
    expect(changeTopics()).not.toBeInTheDocument();
  });

  const expectForYouPrompt = async () => {
    await waitFor(() => expect(changeTopics()).toBeInTheDocument());
    expect(forYou()).toBeInTheDocument();
    expect(sentence()).toBeInTheDocument();
    expect(card()).not.toBeInTheDocument();
  };

  it.each(["dismissed", "done"])("AC5: For you asks for topics when the setting is already %s", async (value) => {
    vi.mocked(usersApi.getSettings).mockResolvedValue({ settings: { TopicOnboarding: value } });
    renderWithProviders(<HomePage />);

    await expectForYouPrompt();
  });

  it("AC5: For you asks for topics when the setting failed to load", async () => {
    vi.mocked(usersApi.getSettings).mockRejectedValue(new Error("down"));
    renderWithProviders(<HomePage />);

    await expectForYouPrompt();
  });

  it("AC5: For you asks for topics when local picks are waiting", async () => {
    writeLocalInterests(["history"]);
    renderWithProviders(<HomePage />);

    await expectForYouPrompt();
  });

  it("AC5: For you asks for topics when the card was dismissed earlier in this page session", async () => {
    window.sessionStorage.setItem("quizymode.topicOnboarding.dismissed", "1");
    vi.mocked(usersApi.getSettings).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<HomePage />);

    await expectForYouPrompt();
  });

  it.each([
    ["is saved", false],
    ["cannot be saved", true],
  ])("AC5: Not now brings back the For you prompt when the dismissal %s", async (_name, writeFails) => {
    if (writeFails) vi.mocked(usersApi.updateSetting).mockRejectedValue(new Error("down"));
    renderWithProviders(<HomePage />);

    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));

    await expectForYouPrompt();
    expect(screen.getByRole("link", { name: /Daily quiz/ })).toHaveFocus();
  });
});
