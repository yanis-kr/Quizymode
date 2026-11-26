/**
 * About hook question (#884). The AC ids in the test names are the ids in docs/AC.md.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import type { StarterPool, StarterPoolEntry } from "@/api/starter";
import { starterApi } from "@/api/starter";
import type { ItemResponse } from "@/types/api";
import AboutPage from "./pages/AboutPage";
import { AboutHookQuestion } from "./AboutHookQuestion";
import { FALLBACK_HOOK_QUESTION, hookQuestionsFrom, isUsableHookEntry, pickAnotherId, shuffleOptions } from "./aboutHook";

vi.mock("@/api/starter", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/starter")>()),
  starterApi: { getPool: vi.fn() },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: false, isLoading: false, logout: vi.fn(), username: null, email: null, isAdmin: false }),
}));

const getPool = vi.mocked(starterApi.getPool);

function entry(id: string, overrides: Partial<ItemResponse> = {}, wowLine = `Why ${id}.`): StarterPoolEntry {
  return {
    world: "space",
    wowLine,
    item: {
      id,
      category: "science",
      isPrivate: false,
      question: `Question ${id}?`,
      correctAnswer: `Right ${id}`,
      incorrectAnswers: [`Wrong A ${id}`, `Wrong B ${id}`, `Wrong C ${id}`],
      explanation: "",
      createdAt: "2026-01-01T00:00:00Z",
      keywords: [],
      collections: [],
      source: `https://example.org/${id}`,
      ...overrides,
    },
  };
}

function pool(items: StarterPoolEntry[]): StarterPool {
  return { version: "test", items };
}

function renderHook(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AboutHookQuestion />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function questionText(): Promise<string> {
  return (await screen.findByTestId("about-hook-question")).textContent ?? "";
}

function optionButtons(): HTMLElement[] {
  return within(screen.getByTestId("about-hook")).getAllByRole("button").filter((b) => !/Another one/.test(b.textContent ?? ""));
}

describe("AboutHookQuestion (#884)", () => {
  beforeEach(() => {
    getPool.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("AC 3.0.52 a right answer is marked, explained, sourced and announced, and focus moves to the result", async () => {
    getPool.mockResolvedValue(pool([entry("one")]));
    renderHook();
    expect(await questionText()).toBe("Question one?");
    const options = optionButtons();
    expect(options).toHaveLength(4);
    await userEvent.click(screen.getByRole("button", { name: "Right one" }));
    const result = screen.getByTestId("about-hook-result");
    expect(result).toHaveTextContent("Correct. You are now slightly more fun at dinner.");
    expect(result).toHaveTextContent("Why one.");
    const source = within(result).getByRole("link", { name: "example.org" });
    expect(source).toHaveAttribute("href", "https://example.org/one");
    expect(source).toHaveAttribute("target", "_blank");
    expect(source).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("button", { name: /Right one/ })).toHaveTextContent("Right answer");
    const live = screen.getByTestId("about-hook-announcement");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toHaveTextContent("Correct. The answer is Right one.");
    expect(live).not.toHaveTextContent("dinner");
    await waitFor(() => expect(result).toHaveFocus());
  });

  it("AC 3.0.52 a wrong answer marks my pick and the right answer with text, not colour alone", async () => {
    getPool.mockResolvedValue(pool([entry("one")]));
    renderHook();
    await questionText();
    await userEvent.click(screen.getByRole("button", { name: "Wrong A one" }));
    expect(screen.getByTestId("about-hook-result")).toHaveTextContent("Not quite. Now you know, which was the point.");
    expect(screen.getByRole("button", { name: /Wrong A one/ })).toHaveTextContent("Your pick");
    expect(screen.getByRole("button", { name: /Right one/ })).toHaveTextContent("Right answer");
    expect(screen.getByTestId("about-hook-announcement")).toHaveTextContent("Not quite. The answer is Right one.");
  });

  it("AC 3.0.53 works by keyboard alone, every target is 44 px, and nothing takes focus on load", async () => {
    getPool.mockResolvedValue(pool([entry("one"), entry("two")]));
    renderHook();
    await questionText();
    expect(document.body).toHaveFocus();
    for (const button of optionButtons()) expect(button).toHaveClass("min-h-[44px]");
    const user = userEvent.setup();
    await user.tab();
    expect(optionButtons()).toContain(document.activeElement);
    await user.keyboard("{Enter}");
    const result = screen.getByTestId("about-hook-result");
    await waitFor(() => expect(result).toHaveFocus());
    const another = screen.getByRole("button", { name: "Another one" });
    const playAll = screen.getByRole("link", { name: "Play all 5" });
    expect(another).toHaveClass("min-h-[44px]");
    expect(playAll).toHaveClass("min-h-[44px]");
    another.focus();
    await user.keyboard(" ");
    await waitFor(() => expect(screen.queryByTestId("about-hook-result")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("about-hook-question")).toHaveFocus());
  });

  it("AC 3.0.54 never picks a picture question, a question with fewer than 2 or more than 4 options, or one without a source", () => {
    const picture = entry("pic", { questionImage: { url: "/m/flag.webp" } as unknown as ItemResponse["questionImage"] });
    const twoOptions = entry("two", { incorrectAnswers: ["Only wrong"] });
    const fiveOptions = entry("five", { incorrectAnswers: ["a", "b", "c", "d"] });
    const noSource = entry("nosrc", { source: null });
    const badSource = entry("badsrc", { source: "not a url" });
    expect(isUsableHookEntry(picture)).toBe(false);
    expect(isUsableHookEntry(twoOptions)).toBe(true);
    expect(isUsableHookEntry(fiveOptions)).toBe(false);
    expect(isUsableHookEntry(noSource)).toBe(false);
    expect(isUsableHookEntry(badSource)).toBe(false);
    const duplicate = entry("dup", { correctAnswer: "Same", incorrectAnswers: ["Same", "Other"] });
    expect(isUsableHookEntry(duplicate)).toBe(false);
    expect(isUsableHookEntry(entry("ok"))).toBe(true);
    const ids = hookQuestionsFrom([picture, twoOptions, fiveOptions, noSource, badSource]).map((q) => q.id);
    expect(ids).toEqual(["two"]);
  });

  it("AC 3.0.55 shows the static fallback as a normal question when the pool fails, with no error banner", async () => {
    getPool.mockRejectedValue(new Error("offline"));
    renderHook();
    expect(await questionText()).toBe(FALLBACK_HOOK_QUESTION.question);
    expect(optionButtons()).toHaveLength(4);
    expect(screen.queryByText(/error|went wrong|failed/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Saturn" }));
    expect(within(screen.getByTestId("about-hook-result")).getByRole("link", { name: "science.nasa.gov" })).toHaveAttribute(
      "href",
      FALLBACK_HOOK_QUESTION.source
    );
    // One question only, so there is no Another one.
    expect(screen.queryByRole("button", { name: "Another one" })).not.toBeInTheDocument();
  });

  it("AC 3.0.55 shows the fallback when the pool has no usable question", async () => {
    getPool.mockResolvedValue(pool([entry("nosrc", { source: "" })]));
    renderHook();
    expect(await questionText()).toBe(FALLBACK_HOOK_QUESTION.question);
  });

  it("AC 3.0.56 Another one shows a different question each time, and Play all 5 links to /start", async () => {
    getPool.mockResolvedValue(pool([entry("one"), entry("two"), entry("three")]));
    renderHook();
    let previous = await questionText();
    for (let round = 0; round < 6; round += 1) {
      const options = optionButtons();
      await userEvent.click(options[0]);
      expect(screen.getByRole("link", { name: "Play all 5" })).toHaveAttribute("href", "/start");
      await userEvent.click(screen.getByRole("button", { name: "Another one" }));
      const next = await questionText();
      expect(next).not.toBe(previous);
      previous = next;
    }
  });

  it("AC 3.0.56 Another one is hidden when only one usable question exists", async () => {
    getPool.mockResolvedValue(pool([entry("one"), entry("pic", { questionImage: {} as ItemResponse["questionImage"] })]));
    renderHook();
    await questionText();
    await userEvent.click(optionButtons()[0]);
    expect(screen.queryByRole("button", { name: "Another one" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Play all 5" })).toHaveAttribute("href", "/start");
  });

  it("AC 3.0.56 pickAnotherId never repeats the current question and returns null when there is no other", () => {
    const questions = hookQuestionsFrom([entry("one"), entry("two")]);
    for (const seed of [0, 0.3, 0.7, 0.999]) expect(pickAnotherId(questions, "one", seed)).toBe("two");
    expect(pickAnotherId(hookQuestionsFrom([entry("one")]), "one", 0.5)).toBeNull();
    expect(shuffleOptions(["a", "b", "c", "d"], 0.42)).toEqual(shuffleOptions(["a", "b", "c", "d"], 0.42));
    expect([...shuffleOptions(["a", "b", "c", "d"], 0.42)].sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("AC 3.0.57 while the pool is pending the page copy and links are rendered and the hook shows a labelled loading state", async () => {
    vi.stubGlobal("__ABOUT_HTML__", "<p>Image credits.</p>");
    vi.stubGlobal("__APP_VERSION__", "9.9.9");
    vi.stubGlobal("__BUILD_LABEL__", "test");
    vi.stubGlobal("__BUILD_TIME__", "2026-01-01");
    getPool.mockReturnValue(new Promise<StarterPool>(() => undefined));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <AboutPage />
          </MemoryRouter>
        </QueryClientProvider>
      </HelmetProvider>
    );
    await waitFor(() => expect(getPool).toHaveBeenCalled());
    expect(screen.getByRole("status", { name: "Loading a sample question" })).toBeInTheDocument();
    expect(screen.getByTestId("about-hook")).toHaveClass("min-h-[20rem]");
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(7);
    expect(screen.getByRole("link", { name: "Try 5 questions" })).toHaveAttribute("href", "/start");
    expect(screen.getByRole("link", { name: "Source on GitHub" })).toBeInTheDocument();
    expect(screen.queryByTestId("about-hook-question")).not.toBeInTheDocument();
  });
});
