import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import CreateItemPage from "./CreateItemPage";
import { itemsApi } from "@/api/items";
import { refusal } from "@/test/refusal";
import { collectionsApi } from "@/api/collections";
import { taxonomyApi } from "@/api/taxonomy";
import { useExtraKeywordAutocompleteSource } from "@/hooks/useExtraKeywordAutocompleteSource";

const authState = vi.hoisted(() => ({ isAdmin: false }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isAdmin: authState.isAdmin,
  }),
}));

const activeCollection = vi.hoisted(() => ({ id: null as string | null }));

vi.mock("@/hooks/useActiveCollection", () => ({
  useActiveCollection: () => ({
    activeCollectionId: activeCollection.id,
    activeCollection: null,
    setActiveCollectionId: vi.fn(),
    isUpdating: false,
    collections: [],
  }),
}));

vi.mock("@/api/collections", () => ({
  collectionsApi: { addItem: vi.fn().mockResolvedValue({}), getAll: vi.fn() },
}));

vi.mock("@/api/items", () => ({
  itemsApi: {
    create: vi.fn(),
  },
}));

vi.mock("@/api/taxonomy", () => ({
  taxonomyApi: {
    getAll: vi.fn(),
    suggest: vi.fn(),
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
          <Route
            path="/explore/collections/:collectionId/item/:itemId"
            element={
              <>
                <div>Collection Study</div>
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
    activeCollection.id = null;
    authState.isAdmin = false;

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

    vi.mocked(taxonomyApi.suggest).mockResolvedValue({ suggestions: [] });

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
    // The URL prefill is the user's choice: it shows as the topic pill (AC 12.13).
    expect(screen.getByTestId("topic-pill")).toHaveTextContent("science");

    await user.selectOptions(rank1Select, "physiology");
    await waitFor(() => expect(rank1Select).toHaveValue("physiology"));

    await user.selectOptions(rank2Select, "cells");
    await waitFor(() => expect(rank2Select).toHaveValue("cells"));

    await user.type(getFieldControl("Question *"), "What moves muscles?");
    await user.type(getFieldControl("Correct Answer *"), "Motor neurons");
    await user.type(screen.getByPlaceholderText("Incorrect answer 1"), "Tendons");

    await user.click(screen.getByRole("button", { name: /save and study/i }));

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

    await user.click(screen.getByRole("button", { name: /more options/i }));

    // Order: [a1p, a1l, a2p, a2l, a3p, a3l]
    const speechInputs = screen.getAllByPlaceholderText("Optional");
    await user.type(speechInputs[2], "ghost");
    await user.type(speechInputs[4], "bownz");
    await user.type(speechInputs[5], "en-US");

    await user.click(screen.getByRole("button", { name: /save and study/i }));

    await waitFor(() => expect(itemsApi.create).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(itemsApi.create).mock.calls[0][0];
    expect(payload.incorrectAnswers).toEqual(["Ligaments", "Bones"]);
    expect(payload.incorrectAnswerSpeech).toEqual({
      1: { pronunciation: "bownz", languageCode: "en-US" },
    });
  });

  it("sends a trimmed group label and omits a blank one (#359)", async () => {
    // AC 2.1.17, AC 2.1.18
    const user = userEvent.setup({ delay: null });

    renderPage("/create/question?category=science&keywords=anatomy,muscular");
    await waitFor(() => expect(screen.getByLabelText(/subtopic/i)).toHaveValue("muscular"));

    await user.type(getFieldControl("Question *"), "What connects muscle to bone?");
    await user.type(getFieldControl("Correct Answer *"), "Tendons");
    await user.type(screen.getByPlaceholderText("Incorrect answer 1"), "Ligaments");
    await user.click(screen.getByRole("button", { name: /more options/i }));
    await user.type(screen.getByLabelText(/group label \(optional\)/i), "  Tissue ");
    await user.click(screen.getByRole("button", { name: /save and add another/i }));
    await waitFor(() => expect(itemsApi.create).toHaveBeenCalledTimes(1));
    expect(vi.mocked(itemsApi.create).mock.calls[0][0].groupLabel).toBe("Tissue");

    // The label stays for the next question; clearing it omits the field.
    // Saving collapses "More options", so reopen it before editing the label.
    await user.click(screen.getByRole("button", { name: /more options/i }));
    const input = screen.getByLabelText(/group label \(optional\)/i);
    expect(input).toBeVisible();
    expect(input).toHaveValue("  Tissue ");
    await user.clear(input);
    await user.type(getFieldControl("Question *"), "Second?");
    await user.type(getFieldControl("Correct Answer *"), "Yes");
    await user.type(screen.getByPlaceholderText("Incorrect answer 1"), "No");
    await user.click(screen.getByRole("button", { name: /save and add another/i }));
    await waitFor(() => expect(itemsApi.create).toHaveBeenCalledTimes(2));
    expect(vi.mocked(itemsApi.create).mock.calls[1][0].groupLabel).toBeUndefined();
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

    await user.click(screen.getByRole("button", { name: /save and study/i }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(itemsApi.create).not.toHaveBeenCalled();
  });

  it("Save and add another keeps the topic, clears the question and focuses it (#296)", async () => {
    const user = userEvent.setup({ delay: null });

    renderPage("/create/question?category=science&keywords=anatomy,muscular");
    await waitFor(() => expect(screen.getByLabelText(/subtopic/i)).toHaveValue("muscular"));

    await user.type(getFieldControl("Question *"), "What connects muscle to bone?");
    await user.type(getFieldControl("Correct Answer *"), "Tendons");
    await user.type(screen.getByPlaceholderText("Incorrect answer 1"), "Ligaments");

    await user.click(screen.getByRole("button", { name: /save and add another/i }));

    await waitFor(() => expect(itemsApi.create).toHaveBeenCalledTimes(1));
    const saved = await screen.findByText("Saved. Add the next question.");
    expect(saved).toHaveAttribute("role", "status");
    expect(getFieldControl("Question *")).toHaveValue("");
    expect(getFieldControl("Correct Answer *")).toHaveValue("");
    expect(screen.getByPlaceholderText("Incorrect answer 1")).toHaveValue("");
    expect(getFieldControl("Question *")).toHaveFocus();
    expect(screen.getByLabelText(/category \*/i)).toHaveValue("science");
    expect(screen.getByLabelText(/primary topic/i)).toHaveValue("anatomy");
    expect(screen.getByLabelText(/subtopic/i)).toHaveValue("muscular");
    // Stayed on the form.
    expect(screen.getByTestId("location")).toHaveTextContent("/create/question");

    // The next question is saved with the kept topic.
    await user.type(getFieldControl("Question *"), "Second?");
    await user.type(getFieldControl("Correct Answer *"), "Yes");
    await user.type(screen.getByPlaceholderText("Incorrect answer 1"), "No");
    await user.click(screen.getByRole("button", { name: /save and add another/i }));
    await waitFor(() => expect(itemsApi.create).toHaveBeenCalledTimes(2));
    expect(vi.mocked(itemsApi.create).mock.calls[1][0]).toEqual(
      expect.objectContaining({
        question: "Second?",
        category: "science",
        navigationKeyword1: "anatomy",
        navigationKeyword2: "muscular",
      })
    );
  });

  it("AC 17.8 shows the server message for a refused save and keeps the question", async () => {
    vi.mocked(itemsApi.create).mockRejectedValue(refusal("Daily question limit reached."));
    const user = userEvent.setup({ delay: null });
    renderPage("/create/question?category=science&keywords=anatomy,muscular");
    await waitFor(() => expect(screen.getByLabelText(/subtopic/i)).toHaveValue("muscular"));
    await user.type(getFieldControl("Question *"), "What connects muscle to bone?");
    await user.type(getFieldControl("Correct Answer *"), "Tendons");
    await user.type(screen.getByPlaceholderText("Incorrect answer 1"), "Ligaments");

    await user.click(screen.getByRole("button", { name: /save and study/i }));

    expect(await screen.findByText("Daily question limit reached.")).toBeInTheDocument();
    expect(getFieldControl("Question *")).toHaveValue("What connects muscle to bone?");
    expect(itemsApi.create).toHaveBeenCalledTimes(1);
  });

  it("Save and study opens the study route of the active collection (#296)", async () => {
    activeCollection.id = "col-1";
    const user = userEvent.setup({ delay: null });

    renderPage("/create/question?category=science&keywords=anatomy,muscular");
    await waitFor(() => expect(screen.getByLabelText(/subtopic/i)).toHaveValue("muscular"));

    await user.type(getFieldControl("Question *"), "What connects muscle to bone?");
    await user.type(getFieldControl("Correct Answer *"), "Tendons");
    await user.type(screen.getByPlaceholderText("Incorrect answer 1"), "Ligaments");
    await user.click(screen.getByRole("button", { name: /save and study/i }));

    expect(await screen.findByText("Collection Study")).toBeInTheDocument();
    expect(collectionsApi.addItem).toHaveBeenCalledWith("col-1", { itemId: "item-123" });
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/explore/collections/col-1/item/item-123"
    );
  });

  it("Save and study without an active collection opens the item page (#296)", async () => {
    const user = userEvent.setup({ delay: null });

    renderPage("/create/question?category=science&keywords=anatomy,muscular");
    await waitFor(() => expect(screen.getByLabelText(/subtopic/i)).toHaveValue("muscular"));

    await user.type(getFieldControl("Question *"), "What connects muscle to bone?");
    await user.type(getFieldControl("Correct Answer *"), "Tendons");
    await user.type(screen.getByPlaceholderText("Incorrect answer 1"), "Ligaments");
    await user.click(screen.getByRole("button", { name: /save and study/i }));

    expect(await screen.findByText("Item Detail")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/items/item-123");
  });

  async function fillValidQuestion(user: ReturnType<typeof userEvent.setup>) {
    renderPage("/create/question?category=science&keywords=anatomy,muscular");
    await screen.findByTestId("topic-pill");
    await user.type(getFieldControl("Question *"), "What moves muscles?");
    await user.type(getFieldControl("Correct Answer *"), "Motor neurons");
    await user.type(screen.getByPlaceholderText("Incorrect answer 1"), "Tendons");
  }

  it.each(["Correct Answer", "Incorrect answer 1"])(
    "Enter in %s saves once and opens the question like Save and study (#927)",
    async (field) => {
      const user = userEvent.setup({ delay: null });
      await fillValidQuestion(user);

      const input =
        field === "Correct Answer"
          ? getFieldControl("Correct Answer *")
          : screen.getByPlaceholderText(field);
      await user.type(input, "{Enter}");

      await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/items/item-123"));
      expect(itemsApi.create).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("Saved. Add the next question.")).not.toBeInTheDocument();
    }
  );

  it("Enter applies the highlighted keyword suggestion without submitting (#927)", async () => {
    const user = userEvent.setup({ delay: null });
    await fillValidQuestion(user);
    await user.click(screen.getByRole("button", { name: "More options" }));

    await user.type(screen.getByPlaceholderText(/^Keyword \(max/), "ar{Enter}");

    expect(screen.getByRole("button", { name: "Remove arms" })).toBeInTheDocument();
    expect(itemsApi.create).not.toHaveBeenCalled();
  });

  it("Enter saves nothing while a required field is empty (#927)", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage("/create/question?category=science&keywords=anatomy,muscular");
    await screen.findByTestId("topic-pill");

    await user.type(getFieldControl("Correct Answer *"), "Motor neurons{Enter}");

    expect(itemsApi.create).not.toHaveBeenCalled();
  });

  it("Enter saves nothing new while a save is in flight (#927)", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(itemsApi.create).mockReturnValue(new Promise(() => {}));
    await fillValidQuestion(user);
    await user.type(getFieldControl("Correct Answer *"), "{Enter}");
    await screen.findByRole("button", { name: "Saving..." });

    await user.type(getFieldControl("Correct Answer *"), "{Enter}");

    expect(itemsApi.create).toHaveBeenCalledTimes(1);
  });

  it("Enter that confirms an input method conversion saves nothing (#927, #935)", async () => {
    const user = userEvent.setup({ delay: null });
    const requestSubmit = vi.spyOn(HTMLFormElement.prototype, "requestSubmit");
    try {
      await fillValidQuestion(user);

      fireEvent.keyDown(getFieldControl("Correct Answer *"), { key: "Enter", keyCode: 229 });

      expect(requestSubmit).not.toHaveBeenCalled();
      expect(itemsApi.create).not.toHaveBeenCalled();

      // Other browsers report the same confirm Enter as isComposing.
      fireEvent.keyDown(getFieldControl("Correct Answer *"), { key: "Enter", isComposing: true });

      expect(requestSubmit).not.toHaveBeenCalled();

      // The same key event without either does save, so the checks above are not vacuous.
      fireEvent.keyDown(getFieldControl("Correct Answer *"), { key: "Enter" });

      expect(requestSubmit).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(itemsApi.create).toHaveBeenCalledTimes(1));
    } finally {
      requestSubmit.mockRestore();
    }
  });

  it("Save and add another runs native validation and does not save a blank question (#296)", async () => {
    const user = userEvent.setup({ delay: null });

    renderPage("/create/question?category=science&keywords=anatomy,muscular");
    await waitFor(() => expect(screen.getByLabelText(/subtopic/i)).toHaveValue("muscular"));

    await user.type(getFieldControl("Correct Answer *"), "Tendons");
    await user.type(screen.getByPlaceholderText("Incorrect answer 1"), "Ligaments");
    await user.click(screen.getByRole("button", { name: /save and add another/i }));

    expect(itemsApi.create).not.toHaveBeenCalled();
    expect(screen.queryByText("Saved. Add the next question.")).not.toBeInTheDocument();
  });

  const SUBTITLE =
    "Add a question with its correct answer and wrong answers. An explanation is optional.";

  it("is headed Write a question with a subtitle and no admin wording for a regular user (AC 2.2.4, #901)", async () => {
    const { container } = renderPage("/create/question");

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(/^Write a question$/);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText(SUBTITLE, { exact: false }).textContent).toBe(SUBTITLE);
    // Closed disclosures stay in the DOM, so textContent covers the whole page.
    expect(screen.getByRole("button", { name: "Read the content rules" })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/admin/i);
  });

  it("also tells an admin that the question can be made public (AC 2.2.4, #901)", async () => {
    authState.isAdmin = true;
    renderPage("/create/question");

    await screen.findByRole("heading", { level: 1, name: "Write a question" });
    expect(screen.getByText(SUBTITLE, { exact: false }).textContent).toBe(
      `${SUBTITLE} As an admin, you can make it public.`
    );
    expect(screen.getByRole("checkbox", { name: "Private question" })).toBeEnabled();
  });

  it.each([
    [false, false],
    [true, true],
  ])(
    "creates a regular user's question as private with review requested %s (AC 2.1.4, AC 2.1.5, #901)",
    async (requestReview, expected) => {
      const user = userEvent.setup({ delay: null });

      renderPage("/create/question?category=science&keywords=anatomy,muscular");
      await waitFor(() => expect(screen.getByLabelText(/subtopic/i)).toHaveValue("muscular"));

      expect(
        screen.getByText("Private: it is not listed in public categories or search.")
      ).toBeInTheDocument();
      expect(screen.queryByRole("checkbox", { name: /private/i })).not.toBeInTheDocument();

      await user.type(getFieldControl("Question *"), "What connects muscle to bone?");
      await user.type(getFieldControl("Correct Answer *"), "Tendons");
      await user.type(screen.getByPlaceholderText("Incorrect answer 1"), "Ligaments");
      if (requestReview) {
        await user.click(
          screen.getByRole("checkbox", { name: "Request review to make this question public" })
        );
      }
      await user.click(screen.getByRole("button", { name: /save and study/i }));

      await waitFor(() => expect(itemsApi.create).toHaveBeenCalledTimes(1));
      const payload = vi.mocked(itemsApi.create).mock.calls[0][0];
      expect(payload.isPrivate).toBe(true);
      expect(payload.readyForReview).toBe(expected);
    }
  );
});
