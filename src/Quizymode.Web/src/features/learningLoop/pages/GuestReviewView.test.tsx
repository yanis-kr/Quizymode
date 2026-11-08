import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AxiosError, type AxiosResponse } from "axios";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import { itemsApi } from "@/api/items";
import type { ItemResponse } from "@/types/api";
import { GUEST_REVIEW_LIST_STORAGE_KEY, addLocalReviewItems, readLocalReviewList } from "../localReviewList";
import { GuestReviewView } from "./GuestReviewView";

vi.mock("@/api/items", () => ({ itemsApi: { getById: vi.fn() } }));
vi.mock("@/components/SEO", () => ({ SEO: () => null }));
// The quiz itself is covered elsewhere; here each item is one button that answers correctly.
vi.mock("../FixedSetQuiz", () => ({
  FixedSetQuiz: ({ items, onAnswer }: { items: ItemResponse[]; onAnswer: (item: ItemResponse, correct: boolean) => void }) => (
    <div>
      {items.map((item) => (
        <button key={item.id} type="button" onClick={() => onAnswer(item, true)}>
          Answer {item.question}
        </button>
      ))}
    </div>
  ),
}));

const idA = "00000000-0000-4000-8000-00000000000a";
const idB = "00000000-0000-4000-8000-00000000000b";

const item = (id: string, question: string): ItemResponse =>
  ({ id, question, correctAnswer: "Right", incorrectAnswers: ["Wrong one", "Wrong two"] }) as unknown as ItemResponse;

function httpError(status: number): AxiosError {
  return new AxiosError("failed", "ERR", undefined, undefined, { status, data: {} } as AxiosResponse);
}

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <GuestReviewView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("GuestReviewView (AC 3.14.15)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    installMemoryLocalStorage();
  });

  it("shows the empty state with links when nothing is stored", () => {
    renderView();
    expect(screen.getByText("Nothing to review right now.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /play the daily quiz/i })).toHaveAttribute("href", "/daily");
    expect(itemsApi.getById).not.toHaveBeenCalled();
  });

  it("plays the stored items labelled This browser only", async () => {
    addLocalReviewItems([idA, idB]);
    vi.mocked(itemsApi.getById).mockImplementation(async (id: string) => item(id, `Q ${id.slice(-1)}`));
    renderView();
    expect(await screen.findByRole("button", { name: "Answer Q a" })).toBeInTheDocument();
    expect(screen.getByText(/This browser only/)).toBeInTheDocument();
  });

  it("removes an item that is missing or private, without showing it", async () => {
    addLocalReviewItems([idA, idB]);
    vi.mocked(itemsApi.getById).mockImplementation(async (id: string) => {
      if (id === idB) throw httpError(404);
      return item(id, "Q a");
    });
    renderView();
    expect(await screen.findByRole("button", { name: "Answer Q a" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Answer Q b/ })).toBeNull();
    expect(readLocalReviewList().map((entry) => entry.itemId)).toEqual([idA]);
  });

  it("removes an item from the list when it is answered correctly", async () => {
    addLocalReviewItems([idA]);
    vi.mocked(itemsApi.getById).mockImplementation(async (id: string) => item(id, "Q a"));
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "Answer Q a" }));
    await waitFor(() => expect(window.localStorage.getItem(GUEST_REVIEW_LIST_STORAGE_KEY)).not.toBeNull());
    expect(readLocalReviewList()).toEqual([]);
  });
});
