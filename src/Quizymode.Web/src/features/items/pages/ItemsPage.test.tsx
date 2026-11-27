import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import ItemsPage from "./ItemsPage";
import { itemsApi } from "@/api/items";

vi.mock("@/api/items", () => ({ itemsApi: { getRandom: vi.fn() } }));
vi.mock("@/components/study/QuestionImage", () => ({ QuestionImage: () => null }));

describe("ItemsPage wording (#923)", () => {
  it("AC 3.6.49 speaks of questions on the mode choice and counts them in the list", async () => {
    vi.mocked(itemsApi.getRandom).mockResolvedValue({
      items: Array.from({ length: 11 }, (_, index) => ({ id: `q${index}`, question: `Q${index}`, category: "science" })),
    } as never);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/items"]}>
          <ItemsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("heading", { name: "Get Random Questions" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\b(item|items|sets)\b/i);
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: /flashcards mode/i }));
    expect(await screen.findByText(/\(11 questions\)/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\b(item|items|sets)\b/i);
  });
});
