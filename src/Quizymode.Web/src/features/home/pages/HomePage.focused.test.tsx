import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import HomePage from "./HomePage";
import { categoriesApi } from "@/api/categories";
import { collectionsApi } from "@/api/collections";
import { featuredApi } from "@/api/featured";
import { interestsApi } from "@/api/learningLoop";
import { usersApi } from "@/api/users";
import { studySessionsApi } from "@/api/studySessions";
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
vi.mock("@/api/studySessions", () => ({ studySessionsApi: { list: vi.fn() } }));
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
    expect(screen.queryByText(/start with fun trivia facts/i)).not.toBeInTheDocument();
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

    expect(screen.getByText(/start with fun trivia facts/i)).toBeInTheDocument();
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
    renderWithProviders(<HomePage />);

    expect(await screen.findByRole("region", { name: "Make Home yours" })).toBeInTheDocument();
    expect(headingOrder()).toEqual(["Make Home yours", "Today", "For you"]);
    expect(screen.getByText(/start with fun trivia facts/i)).toBeInTheDocument();
    expect(screen.queryByText("Explore all topics")).not.toBeInTheDocument();
  });

  it("a failed topics load falls back to the full Home without the onboarding card", async () => {
    auth.value = { isAuthenticated: true, isLoading: false, userId: "user-1" };
    vi.mocked(interestsApi.get).mockRejectedValue(new Error("down"));
    renderWithProviders(<HomePage />);

    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(screen.getByText(/start with fun trivia facts/i)).toBeInTheDocument();
    expect(screen.getByText("Categories")).toBeInTheDocument();
    expect(screen.queryByText("Explore all topics")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Make Home yours" })).not.toBeInTheDocument();
  });
});
