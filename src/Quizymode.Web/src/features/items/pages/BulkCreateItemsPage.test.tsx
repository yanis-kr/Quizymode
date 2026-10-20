import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import BulkCreateItemsPage from "./BulkCreateItemsPage";
import { taxonomyApi } from "@/api/taxonomy";

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
});
