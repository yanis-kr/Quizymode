import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import CreateItemPage from "./CreateItemPage";
import { itemsApi } from "@/api/items";
import { taxonomyApi } from "@/api/taxonomy";
import { useExtraKeywordAutocompleteSource } from "@/hooks/useExtraKeywordAutocompleteSource";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isAdmin: false,
  }),
}));

vi.mock("@/api/items", () => ({
  itemsApi: {
    create: vi.fn(),
  },
}));

vi.mock("@/api/taxonomy", () => ({
  taxonomyApi: {
    getAll: vi.fn(),
  },
}));

vi.mock("@/hooks/useExtraKeywordAutocompleteSource", () => ({
  useExtraKeywordAutocompleteSource: vi.fn(),
}));

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function getFieldControl(labelText: string) {
  const label = screen.getByText(labelText);
  const control = label.nextElementSibling;
  if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) {
    throw new Error(`No input control found for label "${labelText}"`);
  }
  return control;
}

function renderPage(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/create/question"
            element={
              <>
                <CreateItemPage />
                <LocationDisplay />
              </>
            }
          />
          <Route
            path="/items/:id"
            element={
              <>
                <div>Item Detail</div>
                <LocationDisplay />
              </>
            }
          />
          <Route path="/login" element={<div>Login</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("CreateItemPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(taxonomyApi.getAll).mockResolvedValue({
      categories: [
        {
          slug: "science",
          name: "Science",
          description: "",
          itemCount: 0,
          allKeywordSlugs: ["anatomy", "muscular", "arms", "physiology", "cells"],
          groups: [
            {
              slug: "anatomy",
              description: null,
              itemCount: 0,
              keywords: [{ slug: "muscular", description: null, itemCount: 0 }],
            },
            {
              slug: "physiology",
              description: null,
              itemCount: 0,
              keywords: [{ slug: "cells", description: null, itemCount: 0 }],
            },
          ],
        },
      ],
    });

    vi.mocked(useExtraKeywordAutocompleteSource).mockReturnValue({
      extraKeywordAutocompleteSource: ["arms"],
      itemTagKeywordsLoading: false,
    });

    vi.mocked(itemsApi.create).mockResolvedValue({
      id: "item-123",
    } as Awaited<ReturnType<typeof itemsApi.create>>);
  });

  it("keeps URL-prefilled scope editable and redirects to the created item after submit", async () => {
    const user = userEvent.setup({ delay: null });

    renderPage("/create/question?category=science&keywords=anatomy,muscular,arms");

    const categorySelect = await screen.findByLabelText(/category \*/i);
    const rank1Select = await screen.findByLabelText(/primary topic/i);
    const rank2Select = await screen.findByLabelText(/subtopic/i);

    await waitFor(() => {
      expect(categorySelect).toHaveValue("science");
      expect(rank1Select).toHaveValue("anatomy");
      expect(rank2Select).toHaveValue("muscular");
    });

    expect(screen.getByText("arms")).toBeInTheDocument();

    await user.selectOptions(rank1Select, "physiology");
    await waitFor(() => expect(rank1Select).toHaveValue("physiology"));

    await user.selectOptions(rank2Select, "cells");
    await waitFor(() => expect(rank2Select).toHaveValue("cells"));

    await user.type(getFieldControl("Question *"), "What moves muscles?");
    await user.type(getFieldControl("Correct Answer *"), "Motor neurons");
    await user.type(screen.getByPlaceholderText("Incorrect answer 1"), "Tendons");

    await user.click(screen.getByRole("button", { name: /create item/i }));

    await waitFor(() =>
      expect(itemsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "science",
          navigationKeyword1: "physiology",
          navigationKeyword2: "cells",
          keywords: [{ name: "arms", isPrivate: false }],
        })
      )
    );

    expect(await screen.findByText("Item Detail")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/items/item-123");
  });

  it("links back to the Create hub keeping the scope query (#296)", async () => {
    renderPage("/create/question?category=science&keywords=anatomy,muscular");

    const back = await screen.findByRole("link", { name: /back to create/i });
    expect(back).toHaveAttribute("href", "/create?category=science&keywords=anatomy,muscular");
  });

  it("re-indexes incorrect-answer speech after dropping a blank answer (#269)", async () => {
    // AC 3.12.7
    const user = userEvent.setup({ delay: null });

    renderPage("/create/question?category=science&keywords=anatomy,muscular");

    await waitFor(() => expect(screen.getByLabelText(/subtopic/i)).toHaveValue("muscular"));

    await user.type(getFieldControl("Question *"), "What connects muscle to bone?");
    await user.type(getFieldControl("Correct Answer *"), "Tendons");
    await user.type(screen.getByPlaceholderText("Incorrect answer 1"), "Ligaments");
    await user.type(screen.getByPlaceholderText("Incorrect answer 3"), "Bones");

    // Order: [a1p, a1l, a2p, a2l, a3p, a3l]
    const speechInputs = screen.getAllByPlaceholderText("Optional");
    await user.type(speechInputs[2], "ghost");
    await user.type(speechInputs[4], "bownz");
    await user.type(speechInputs[5], "en-US");

    await user.click(screen.getByRole("button", { name: /create item/i }));

    await waitFor(() => expect(itemsApi.create).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(itemsApi.create).mock.calls[0][0];
    expect(payload.incorrectAnswers).toEqual(["Ligaments", "Bones"]);
    expect(payload.incorrectAnswerSpeech).toEqual({
      1: { pronunciation: "bownz", languageCode: "en-US" },
    });
  });

  it.each([
    ["equals the correct answer", ["tendons", ""], "Incorrect answers must be different from the correct answer."],
    ["repeats another incorrect answer", ["Ligaments", " ligaments "], "Incorrect answers must be different from each other."],
  ])("blocks submit when an incorrect answer %s (#276)", async (_label, answers, message) => {
    // AC 2.1.8
    const user = userEvent.setup({ delay: null });

    renderPage("/create/question?category=science&keywords=anatomy,muscular");

    await waitFor(() => expect(screen.getByLabelText(/subtopic/i)).toHaveValue("muscular"));

    await user.type(getFieldControl("Question *"), "What connects muscle to bone?");
    await user.type(getFieldControl("Correct Answer *"), "Tendons");
    for (let i = 0; i < answers.length; i++) {
      if (answers[i]) await user.type(screen.getByPlaceholderText(`Incorrect answer ${i + 1}`), answers[i]);
    }

    await user.click(screen.getByRole("button", { name: /create item/i }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(itemsApi.create).not.toHaveBeenCalled();
  });
});
