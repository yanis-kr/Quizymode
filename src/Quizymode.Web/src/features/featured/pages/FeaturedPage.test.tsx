import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { featuredApi } from "@/api/featured";
import FeaturedPage from "./FeaturedPage";

vi.mock("@/api/featured", () => ({ featuredApi: { get: vi.fn() } }));

const topic = (id: string, displayName: string, itemCount: number) => ({
  id,
  displayName,
  categorySlug: "geography",
  navKeyword1: "capitals",
  navKeyword2: null,
  itemCount,
  lastModifiedAt: null,
  sortOrder: 1,
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <FeaturedPage />
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

describe("FeaturedPage questions and topics wording (#922)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("AC 3.4.12 opens on the Topics tab and counts questions in the singular and plural (#922)", async () => {
    vi.mocked(featuredApi.get).mockResolvedValue({
      sets: [topic("f1", "World Capitals", 12), topic("f2", "One Capital", 1)],
      collections: [],
    } as never);

    renderPage();

    expect(await screen.findByRole("button", { name: /World Capitals/ })).toHaveTextContent("12 questions");
    expect(screen.getByRole("button", { name: /One Capital/ })).toHaveTextContent("1 question");
    expect(screen.getByRole("button", { name: /One Capital/ })).not.toHaveTextContent("1 questions");
    expect(screen.getByRole("button", { name: "Topics" })).toBeInTheDocument();
    expect(screen.getAllByText("Topic")).toHaveLength(2);
    expect(screen.getAllByText("Updated No questions yet")).toHaveLength(2);
    expect(screen.getByText(/Hand-picked topics and collections\./)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\b(item|items|sets)\b/i);
  });

  it("AC 3.4.12 names the empty tabs in the new wording and counts questions on collections (#922)", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(featuredApi.get).mockResolvedValue({ sets: [], collections: [] });
    const { unmount } = renderPage();

    expect(await screen.findByText("No featured topics yet. Check back soon.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Collections" }));
    expect(screen.getByText("No featured collections yet. Check back soon.")).toBeInTheDocument();
    unmount();

    vi.mocked(featuredApi.get).mockResolvedValue({
      sets: [],
      collections: [
        {
          id: "fc1",
          collectionId: "11111111-1111-4111-8111-111111111111",
          displayName: "Aha Trivia",
          description: null,
          itemCount: 1,
          lastModifiedAt: null,
          sortOrder: 1,
        },
      ],
    } as never);
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Collections" }));
    expect(screen.getByRole("button", { name: /Aha Trivia/ })).toHaveTextContent("1 question");
  });
});
