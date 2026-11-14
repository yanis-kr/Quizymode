import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import { featuredApi, type FeaturedSetDto } from "@/api/featured";
import { interestsApi } from "@/api/learningLoop";
import { readGuestHistory, type GuestRunSummary } from "@/features/guestHistory/guestHistoryStorage";
import { writeLocalInterests } from "./localLearningState";
import { renderWithProviders } from "./learningLoopTestUtils";
import { DailyExploreNext } from "./DailyExploreNext";
import { exploreNextPath } from "./useExploreNextSets";

const auth = vi.hoisted(() => ({ value: { isAuthenticated: false, isLoading: false, userId: null as string | null } }));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth.value }));
vi.mock("@/api/featured", () => ({ featuredApi: { get: vi.fn() } }));
vi.mock("@/api/learningLoop", () => ({ interestsApi: { get: vi.fn(), popularCategories: vi.fn() } }));
vi.mock("@/api/studySessions", () => ({ studySessionsApi: { list: vi.fn().mockResolvedValue([]) } }));
vi.mock("@/features/guestHistory/guestHistoryStorage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/guestHistory/guestHistoryStorage")>()),
  readGuestHistory: vi.fn(() => []),
}));

const set = (id: string, displayName: string, categorySlug: string, nav1: string | null, nav2: string | null, sortOrder: number): FeaturedSetDto => ({
  id,
  displayName,
  categorySlug,
  navKeyword1: nav1,
  navKeyword2: nav2,
  itemCount: 10,
  lastModifiedAt: null,
  sortOrder,
});

const featured = [
  set("f1", "Guess the Flag", "geography", "flags", "countries", 1),
  set("f2", "Solar System Sprint", "science", "space", null, 2),
  set("f3", "Brain Teasers", "trivia", null, null, 3),
  set("f4", "Ancient Rome", "history", "rome", null, 4),
];

const historyRun = (categorySlug: string): GuestRunSummary =>
  ({
    runId: "r1",
    completedAt: new Date().toISOString(),
    correct: 3,
    total: 5,
    mode: "quiz",
    source: { kind: "category", categorySlug, navigationKeywords: [], filterKeywords: [] },
    missedItemIds: [],
  }) as unknown as GuestRunSummary;

describe("DailyExploreNext (#649)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMemoryLocalStorage();
    auth.value = { isAuthenticated: false, isLoading: false, userId: null };
    vi.mocked(readGuestHistory).mockReturnValue([]);
    vi.mocked(featuredApi.get).mockResolvedValue({ sets: featured, collections: [] } as unknown as Awaited<ReturnType<typeof featuredApi.get>>);
    vi.mocked(interestsApi.popularCategories).mockResolvedValue(["science"]);
  });

  it("builds quiz links with the set's scope and five questions", () => {
    expect(exploreNextPath(featured[0])).toBe("/quiz/geography?nav=flags%2Ccountries&keywords=flags%2Ccountries&size=5");
    expect(exploreNextPath(featured[2])).toBe("/quiz/trivia?size=5");
  });

  it("cold start (no topics, no runs): three tiles, popular first, each one tap to a size=5 quiz", async () => {
    renderWithProviders(<DailyExploreNext />);
    const heading = await screen.findByRole("heading", { name: "Explore next" });
    const links = await waitFor(() => {
      const found = within(heading.parentElement as HTMLElement).getAllByRole("link");
      expect(found).toHaveLength(3);
      return found;
    });
    expect(links[0]).toHaveTextContent("Solar System Sprint");
    expect(links[0]).toHaveAttribute("href", "/quiz/science?nav=space&keywords=space&size=5");
    for (const link of links) {
      expect(link.getAttribute("href")).toMatch(/^\/quiz\/.+size=5$/);
      expect(link).toHaveTextContent("5 questions");
      expect(link).toHaveTextContent("Play 5");
    }
  });

  it("with saved topics the tiles come from the topics, not from popular", async () => {
    writeLocalInterests(["history"]);
    renderWithProviders(<DailyExploreNext />);
    const link = await screen.findByRole("link", { name: /Ancient Rome/ });
    expect(link).toHaveAttribute("href", "/quiz/history?nav=rome&keywords=rome&size=5");
    expect(screen.queryByRole("link", { name: /Solar System Sprint/ })).toBeNull();
  });

  it("a guest with past runs but no topics is filled from the featured catalog when the played category has no set", async () => {
    vi.mocked(readGuestHistory).mockReturnValue([historyRun("languages")]);
    renderWithProviders(<DailyExploreNext />);
    const links = await screen.findAllByRole("link");
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links.length).toBeLessThanOrEqual(3);
    expect(screen.getByRole("link", { name: /Guess the Flag/ })).toBeInTheDocument();
  });

  it("shows three skeletons while loading", async () => {
    vi.mocked(featuredApi.get).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<DailyExploreNext />);
    expect(await screen.findByRole("heading", { name: "Explore next" })).toBeInTheDocument();
    expect(screen.getAllByTestId("explore-next-skeleton")).toHaveLength(3);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders nothing, with no heading, error or alert, when the lookup fails", async () => {
    vi.mocked(featuredApi.get).mockRejectedValue(new Error("down"));
    const { container } = renderWithProviders(<DailyExploreNext />);
    await waitFor(() => expect(featuredApi.get).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryAllByTestId("explore-next-skeleton")).toHaveLength(0));
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders nothing when there are no recommendations", async () => {
    vi.mocked(featuredApi.get).mockResolvedValue({ sets: [], collections: [] } as unknown as Awaited<ReturnType<typeof featuredApi.get>>);
    const { container } = renderWithProviders(<DailyExploreNext />);
    await waitFor(() => expect(screen.queryAllByTestId("explore-next-skeleton")).toHaveLength(0));
    expect(container).toBeEmptyDOMElement();
  });
});
