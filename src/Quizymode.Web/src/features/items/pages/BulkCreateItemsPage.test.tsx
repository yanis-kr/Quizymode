import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import BulkCreateItemsPage from "./BulkCreateItemsPage";
import { taxonomyApi } from "@/api/taxonomy";
import { apiClient } from "@/api/client";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

vi.mock("@/hooks/useActiveCollection", () => ({
  useActiveCollection: () => ({ activeCollectionId: null, setActiveCollectionId: vi.fn() }),
}));

vi.mock("@/components/items/ActiveCollectionNotice", () => ({
  ActiveCollectionNotice: () => null,
}));

vi.mock("@/api/taxonomy", () => ({
  taxonomyApi: { getAll: vi.fn() },
}));

vi.mock("@/api/client", () => ({
  apiClient: { post: vi.fn() },
}));

vi.mock("@/api/collections", () => ({
  collectionsApi: { getAll: vi.fn(), addItem: vi.fn(), addItems: vi.fn() },
}));

vi.mock("@/features/legal/components/ContentComplianceNotice", () => ({
  default: () => null,
}));

const taxonomyMock = {
  categories: [
    {
      slug: "science",
      name: "Science",
      description: "",
      itemCount: 0,
      allKeywordSlugs: ["anatomy", "muscular"],
      groups: [
        {
          slug: "anatomy",
          description: null,
          itemCount: 0,
          keywords: [{ slug: "muscular", description: null, itemCount: 0 }],
        },
      ],
    },
  ],
};

async function goToPaste(user: ReturnType<typeof userEvent.setup>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/items/bulk-create?category=science&keywords=anatomy,muscular"]}>
        <BulkCreateItemsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const generate = await screen.findByRole("button", { name: /generate ai prompt/i });
  await waitFor(() => expect(generate).toBeEnabled());
  await user.click(generate);
}

describe("BulkCreateItemsPage incorrect answers (#250)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(taxonomyApi.getAll).mockResolvedValue(
      taxonomyMock as Awaited<ReturnType<typeof taxonomyApi.getAll>>
    );
  });

  it("asks the AI for 1-4 incorrect answers", async () => {
    // AC 2.2.6.6
    const user = userEvent.setup({ delay: null });
    await goToPaste(user);

    expect(screen.getByText(/1-4 "incorrectAnswers"/)).toBeInTheDocument();
    expect(screen.queryByText(/1-5 "incorrectAnswers"/)).not.toBeInTheDocument();
  });

  it("skips rows without incorrect answers, trims, and keeps the first four", async () => {
    // AC 2.2.6.8
    const user = userEvent.setup({ delay: null });
    await goToPaste(user);
    await user.click(screen.getByRole("button", { name: /i pasted the response/i }));

    const base = { category: "science", navigationKeyword1: "anatomy", navigationKeyword2: "muscular" };
    await user.click(screen.getByRole("textbox"));
    await user.paste(
      JSON.stringify([
        { ...base, question: "Keep?", correctAnswer: "Yes", incorrectAnswers: [" W1 ", "", "W2", "W3", "W4", "W5"] },
        { ...base, question: "Blank?", correctAnswer: "Yes", incorrectAnswers: ["  "] },
        { ...base, question: "Missing?", correctAnswer: "Yes" },
      ])
    );
    await user.click(screen.getByRole("button", { name: /import & review/i }));

    expect(await screen.findByText("Keep?")).toBeInTheDocument();
    expect(screen.queryByText("Blank?")).not.toBeInTheDocument();
    expect(screen.queryByText("Missing?")).not.toBeInTheDocument();
    expect(screen.getByText(/2 item\(s\) skipped: each item needs 1-4 incorrect answers/i)).toBeInTheDocument();
    expect(screen.getByText(/W1, W2, W3, W4$/)).toBeInTheDocument();
  });

  it("shows an error when every row lacks incorrect answers", async () => {
    // AC 2.2.6.8
    const user = userEvent.setup({ delay: null });
    await goToPaste(user);
    await user.click(screen.getByRole("button", { name: /i pasted the response/i }));
    await user.click(screen.getByRole("textbox"));
    await user.paste(
      JSON.stringify([
        { category: "science", question: "Q", correctAnswer: "A", incorrectAnswers: [] },
      ])
    );
    await user.click(screen.getByRole("button", { name: /import & review/i }));

    expect(await screen.findByText(/1 item\(s\) skipped because they have no incorrect answers/i)).toBeInTheDocument();
  });

  it("skips rows whose incorrect answers repeat or equal the correct answer", async () => {
    // AC 2.2.6.8 (#276)
    const user = userEvent.setup({ delay: null });
    await goToPaste(user);
    await user.click(screen.getByRole("button", { name: /i pasted the response/i }));

    const base = { category: "science", navigationKeyword1: "anatomy", navigationKeyword2: "muscular" };
    await user.click(screen.getByRole("textbox"));
    await user.paste(
      JSON.stringify([
        { ...base, question: "Keep?", correctAnswer: "Yes", incorrectAnswers: ["No", "Maybe"] },
        { ...base, question: "Repeats?", correctAnswer: "Yes", incorrectAnswers: ["No", " no "] },
        { ...base, question: "EqualsCorrect?", correctAnswer: "Yes", incorrectAnswers: ["YES", "No"] },
      ])
    );
    await user.click(screen.getByRole("button", { name: /import & review/i }));

    expect(await screen.findByText("Keep?")).toBeInTheDocument();
    expect(screen.queryByText("Repeats?")).not.toBeInTheDocument();
    expect(screen.queryByText("EqualsCorrect?")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /2 item\(s\) skipped: incorrect answers must be different from each other and from the correct answer/i
      )
    ).toBeInTheDocument();
  });

  it("shows an error when every row is excluded for repeated incorrect answers", async () => {
    // AC 2.2.6.8 (#276)
    const user = userEvent.setup({ delay: null });
    await goToPaste(user);
    await user.click(screen.getByRole("button", { name: /i pasted the response/i }));
    await user.click(screen.getByRole("textbox"));
    await user.paste(
      JSON.stringify([
        { category: "science", question: "Q", correctAnswer: "A", incorrectAnswers: ["B", "b"] },
      ])
    );
    await user.click(screen.getByRole("button", { name: /import & review/i }));

    expect(
      await screen.findByText(
        /No valid items found: 1 item\(s\) skipped because their incorrect answers repeat each other or the correct answer/i
      )
    ).toBeInTheDocument();
  });
});

async function goToSetup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/items/bulk-create?category=science&keywords=anatomy,muscular"]}>
        <BulkCreateItemsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const pasteCloze = await screen.findByRole("button", { name: /^paste cloze text$/i });
  await waitFor(() => expect(pasteCloze).toBeEnabled());
  return pasteCloze;
}

async function pasteIntoCloze(user: ReturnType<typeof userEvent.setup>, text: string) {
  const box = screen.getByRole("textbox", { name: /cloze text, one note per line/i });
  await user.click(box);
  await user.paste(text);
}

const clozeTwoLines = [
  "{{c1::Paris}} is the capital of France | Lyon | Marseille",
  "{{c1::France}}'s capital is {{c2::Paris}} | c1: Spain | c2: Rome",
  "{{c1::No distractors}} here",
].join("\n");

describe("BulkCreateItemsPage cloze (#261)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(taxonomyApi.getAll).mockResolvedValue(
      taxonomyMock as Awaited<ReturnType<typeof taxonomyApi.getAll>>
    );
  });

  it("opens the cloze paste step from setup without a prompt, and Back returns to setup", async () => {
    // AC 2.2.6.18
    const user = userEvent.setup({ delay: null });
    await user.click(await goToSetup());

    expect(screen.getByRole("heading", { name: "3. Paste cloze text" })).toBeInTheDocument();
    expect(screen.queryByText(/copy prompt and run it/i)).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Cloze text" })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "1. Scope" })).toBeInTheDocument();
  });

  it("builds review rows with card labels, the sibling note, and skip reasons", async () => {
    // AC 2.2.6.18, 2.2.6.19, 2.2.6.20
    const user = userEvent.setup({ delay: null });
    await user.click(await goToSetup());
    await pasteIntoCloze(user, clozeTwoLines);
    await user.click(screen.getByRole("button", { name: /import & review/i }));

    expect(await screen.findByText("___ is the capital of France")).toBeInTheDocument();
    expect(screen.getByText("___'s capital is Paris")).toBeInTheDocument();
    expect(screen.getByText("France's capital is ___")).toBeInTheDocument();
    expect(screen.getByText("Card 1 of 1 from line 1")).toBeInTheDocument();
    expect(screen.getByText("Card 1 of 2 from line 2")).toBeInTheDocument();
    expect(screen.getByText("Card 2 of 2 from line 2")).toBeInTheDocument();
    expect(screen.getByText(/can reveal each other's answers/i)).toBeInTheDocument();
    expect(screen.getByText(/1 line\(s\) or card\(s\) skipped/i)).toBeInTheDocument();
    expect(screen.getByText(/Line 3 \(c1\): needs 1-4 incorrect answers/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept card 2 of 2 from line 2" })).toBeInTheDocument();
    expect(screen.getAllByText(/Tags: anatomy, muscular/)).toHaveLength(3);
  });

  it("Accept all posts one /items/bulk request with the setup scope and cloze items", async () => {
    // AC 2.2.6.20
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { totalRequested: 3, createdCount: 3, duplicateCount: 0, failedCount: 0, duplicateQuestions: [], errors: [] },
    });
    const user = userEvent.setup({ delay: null });
    await user.click(await goToSetup());
    await pasteIntoCloze(user, clozeTwoLines);
    await user.click(screen.getByRole("button", { name: /import & review/i }));
    await user.click(await screen.findByRole("button", { name: /accept all \(3\)/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
    const [url, payload] = vi.mocked(apiClient.post).mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe("/items/bulk");
    expect(payload).toMatchObject({
      isPrivate: true,
      category: "science",
      keyword1: "anatomy",
      keyword2: "muscular",
      keywords: [],
    });
    expect(payload.items).toEqual([
      {
        question: "___ is the capital of France",
        correctAnswer: "Paris",
        incorrectAnswers: ["Lyon", "Marseille"],
        explanation: "",
        keywords: undefined,
        source: undefined,
      },
      {
        question: "___'s capital is Paris",
        correctAnswer: "France",
        incorrectAnswers: ["Spain"],
        explanation: "",
        keywords: undefined,
        source: undefined,
      },
      {
        question: "France's capital is ___",
        correctAnswer: "Paris",
        incorrectAnswers: ["Rome"],
        explanation: "",
        keywords: undefined,
        source: undefined,
      },
    ]);
  });

  it("accepting one card from a two-card line removes only that card", async () => {
    // AC 2.2.6.20
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { totalRequested: 1, createdCount: 1, duplicateCount: 0, failedCount: 0, duplicateQuestions: [], errors: [] },
    });
    const user = userEvent.setup({ delay: null });
    await user.click(await goToSetup());
    await pasteIntoCloze(user, clozeTwoLines);
    await user.click(screen.getByRole("button", { name: /import & review/i }));
    await user.click(await screen.findByRole("button", { name: "Accept card 1 of 2 from line 2" }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Saved 1 item/)).toBeInTheDocument();
    expect(screen.queryByText("___'s capital is Paris")).not.toBeInTheDocument();
    expect(screen.getByText("France's capital is ___")).toBeInTheDocument();
    expect(screen.getByText("Card 2 of 2 from line 2")).toBeInTheDocument();
    expect(screen.getByText(/can reveal each other's answers/i)).toBeInTheDocument();
  });

  it("shows an error, the skipped lines, and keeps the text when every line is skipped", async () => {
    // AC 2.2.6.19
    const user = userEvent.setup({ delay: null });
    await user.click(await goToSetup());
    await pasteIntoCloze(user, "no deletion here | x");
    await user.click(screen.getByRole("button", { name: /import & review/i }));

    expect(await screen.findByText(/No valid cards found\. 1 line\(s\) skipped; see the details below\./)).toBeInTheDocument();
    expect(screen.getByText(/Line 1: no \{\{c1::\.\.\.\}\} deletion found/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /cloze text/i })).toHaveValue("no deletion here | x");
  });

  it("asks for text when the cloze box is empty", async () => {
    const user = userEvent.setup({ delay: null });
    await user.click(await goToSetup());
    await user.click(screen.getByRole("button", { name: /import & review/i }));
    expect(await screen.findByText("Paste your cloze text first.")).toBeInTheDocument();
  });

  it("caps non-admin imports at 100 cards and reports truncation", async () => {
    // AC 2.2.6.19
    const user = userEvent.setup({ delay: null });
    await user.click(await goToSetup());
    const lines = Array.from({ length: 101 }, (_, i) => `{{c1::A}} number ${i} | x`).join("\n");
    await pasteIntoCloze(user, lines);
    await user.click(screen.getByRole("button", { name: /import & review/i }));

    expect(await screen.findByText(/Accept all \(100\)/)).toBeInTheDocument();
    expect(screen.getByText(/Only the first 100 cards were kept/)).toBeInTheDocument();
  });

  it("reports in-batch duplicate cards", async () => {
    // AC 2.2.6.19
    const user = userEvent.setup({ delay: null });
    await user.click(await goToSetup());
    await pasteIntoCloze(user, "{{c1::A}} same | x\n{{c1::A}} SAME | y");
    await user.click(screen.getByRole("button", { name: /import & review/i }));
    expect(await screen.findByText(/1 duplicate card\(s\) removed/)).toBeInTheDocument();
  });

  it("the format toggle switches to the JSON paste box and back", async () => {
    // AC 2.2.6.18
    const user = userEvent.setup({ delay: null });
    await user.click(await goToSetup());
    await user.click(screen.getByRole("radio", { name: "AI JSON response" }));

    expect(screen.getByRole("heading", { name: "3. Paste AI response" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /cloze text/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Cloze text" }));
    expect(screen.getByRole("textbox", { name: /cloze text/i })).toBeInTheDocument();
  });

  it("Generate AI Prompt forces the JSON paste format", async () => {
    // AC 2.2.6.18
    const user = userEvent.setup({ delay: null });
    await user.click(await goToSetup());
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: /generate ai prompt/i }));
    await user.click(screen.getByRole("button", { name: /i pasted the response/i }));

    expect(screen.getByRole("heading", { name: "3. Paste AI response" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "AI JSON response" })).toBeChecked();
    expect(screen.queryByRole("textbox", { name: /cloze text/i })).not.toBeInTheDocument();
  });

  it("Back from the cloze step returns to the prompt when a prompt was generated", async () => {
    const user = userEvent.setup({ delay: null });
    await user.click(await goToSetup());
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: /generate ai prompt/i }));
    await user.click(screen.getByRole("button", { name: /i pasted the response/i }));
    await user.click(screen.getByRole("radio", { name: "Cloze text" }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: /2\. Copy prompt/ })).toBeInTheDocument();
  });

  it("does not show stale JSON skip counters after a cloze import", async () => {
    // AC 2.2.6.20
    const user = userEvent.setup({ delay: null });
    await goToPaste(user);
    await user.click(screen.getByRole("button", { name: /i pasted the response/i }));
    const base = { category: "science", navigationKeyword1: "anatomy", navigationKeyword2: "muscular" };
    await user.click(screen.getByRole("textbox"));
    await user.paste(
      JSON.stringify([
        { ...base, question: "Keep?", correctAnswer: "Yes", incorrectAnswers: ["No"] },
        { ...base, question: "Skip?", correctAnswer: "Yes", incorrectAnswers: [] },
      ])
    );
    await user.click(screen.getByRole("button", { name: /import & review/i }));
    expect(await screen.findByText(/1 item\(s\) skipped: each item needs 1-4 incorrect answers/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /back to paste/i }));
    await user.click(screen.getByRole("radio", { name: "Cloze text" }));
    await pasteIntoCloze(user, "{{c1::A}} is a letter | B");
    await user.click(screen.getByRole("button", { name: /import & review/i }));

    expect(await screen.findByText("___ is a letter")).toBeInTheDocument();
    expect(screen.queryByText(/item\(s\) skipped/i)).not.toBeInTheDocument();
  });

  it("clears a cloze report when switching to the JSON format", async () => {
    // AC 2.2.6.19
    const user = userEvent.setup({ delay: null });
    await user.click(await goToSetup());
    await pasteIntoCloze(user, "no deletion here | x");
    await user.click(screen.getByRole("button", { name: /import & review/i }));
    expect(await screen.findByText(/Line 1:/)).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "AI JSON response" }));
    expect(screen.queryByText(/Line 1:/)).not.toBeInTheDocument();
  });
});
