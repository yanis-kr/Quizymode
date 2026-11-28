import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import EditItemPage from "./EditItemPage";
import { itemsApi } from "@/api/items";
import { taxonomyApi } from "@/api/taxonomy";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentUserIdState } from "@/hooks/useCurrentUserId";
import { useExtraKeywordAutocompleteSource } from "@/hooks/useExtraKeywordAutocompleteSource";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/api/items", () => ({
  itemsApi: {
    getById: vi.fn(),
    update: vi.fn(),
    setVisibility: vi.fn(),
  },
}));

vi.mock("@/api/taxonomy", () => ({
  taxonomyApi: {
    getAll: vi.fn(),
    suggest: vi.fn(),
  },
}));

vi.mock("@/hooks/useExtraKeywordAutocompleteSource", () => ({
  useExtraKeywordAutocompleteSource: vi.fn(() => ({
    extraKeywordAutocompleteSource: [],
    itemTagKeywordsLoading: false,
  })),
}));

vi.mock("@/hooks/useCurrentUserId", () => ({
  useCurrentUserIdState: vi.fn(),
}));

vi.mock("@/components/LoadingSpinner", () => ({ default: () => <div>Loading...</div> }));
vi.mock("@/components/ErrorMessage", () => ({
  default: ({ message }: { message: string }) => <div>{message}</div>,
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

const itemMock = {
  id: "item-1",
  category: "science",
  isPrivate: true,
  question: "Old question?",
  correctAnswer: "Old answer",
  incorrectAnswers: ["W1", "W2", "W3"],
  explanation: "Old explanation",
  createdAt: "2026-01-01T00:00:00Z",
  createdBy: "user-1",
  keywords: [],
  collections: [],
  navigationBreadcrumb: ["anatomy", "muscular"],
  source: null,
  factualRisk: null,
  reviewComments: null,
  readyForReview: false,
};

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
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
            path="/items/:id/edit"
            element={
              <>
                <EditItemPage />
                <LocationDisplay />
              </>
            }
          />
          <Route path="/categories" element={<LocationDisplay />} />
          <Route path="/login" element={<div>Login</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("EditItemPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      userId: "user-1",
      isAdmin: false,
    } as ReturnType<typeof useAuth>);

    vi.mocked(useCurrentUserIdState).mockReturnValue({
      userId: "user-1",
      isLoading: false,
      isError: false,
    });

    vi.mocked(taxonomyApi.getAll).mockResolvedValue(
      taxonomyMock as Awaited<ReturnType<typeof taxonomyApi.getAll>>
    );

    vi.mocked(itemsApi.getById).mockResolvedValue(
      itemMock as Awaited<ReturnType<typeof itemsApi.getById>>
    );

    vi.mocked(itemsApi.update).mockResolvedValue(
      itemMock as Awaited<ReturnType<typeof itemsApi.update>>
    );

    vi.mocked(useExtraKeywordAutocompleteSource).mockReturnValue({
      extraKeywordAutocompleteSource: [],
      itemTagKeywordsLoading: false,
    });
  });

  it("shows a read-only picture preview for picture items (#407)", async () => {
    vi.mocked(itemsApi.getById).mockResolvedValue({
      ...itemMock,
      questionImage: { key: "curated:flags/fr", altText: "Three vertical bands" },
    } as Awaited<ReturnType<typeof itemsApi.getById>>);
    renderPage("/items/item-1/edit");

    await screen.findByRole("button", { name: /^save$/i });

    const preview = screen.getByTestId("edit-item-picture");
    expect(preview).toHaveTextContent("Picture comes from seed data; saving keeps it.");
    expect(preview.querySelector("input, textarea, select")).toBeNull();
  });

  it("shows a read-only explanation picture preview that saving keeps (#403)", async () => {
    vi.mocked(itemsApi.getById).mockResolvedValue({
      ...itemMock,
      explanationImage: { key: "curated:flags/fr", altText: "A labelled right triangle" },
    } as Awaited<ReturnType<typeof itemsApi.getById>>);
    renderPage("/items/item-1/edit");

    await screen.findByRole("button", { name: /^save$/i });

    const preview = screen.getByTestId("edit-item-explanation-picture");
    expect(preview).toHaveTextContent("Explanation picture (read-only)");
    expect(preview).toHaveTextContent("saving keeps it");
    expect(preview.querySelector("input, textarea, select")).toBeNull();
  });

  it("shows no picture preview for text-only items", async () => {
    renderPage("/items/item-1/edit");
    await screen.findByRole("button", { name: /^save$/i });
    expect(screen.queryByTestId("edit-item-picture")).not.toBeInTheDocument();
  });

  it("shows a regular user editing a private question the sentence and review checkbox, and saves the request (AC 2.1.4, #901)", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage("/items/item-1/edit");

    // Wait for the form to load by checking for the save button
    const save = await screen.findByRole("button", { name: /^save$/i });

    expect(
      screen.getByText("Private: it is not listed in public categories or search.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /private/i })).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("checkbox", { name: "Request review to make this question public" })
    );
    await user.click(save);

    await waitFor(() => expect(itemsApi.update).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(itemsApi.update).mock.calls[0][1];
    expect(payload.isPrivate).toBe(true);
    expect(payload.readyForReview).toBe(true);
  });

  it.each([
    ["keeps it checked and sends true", false, true],
    ["sends false after it is cleared", true, false],
  ])("loads a set review flag into the owner's checkbox and %s (#928)", async (_name, clear, expected) => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(itemsApi.getById).mockResolvedValue({
      ...itemMock,
      readyForReview: true,
    } as Awaited<ReturnType<typeof itemsApi.getById>>);
    renderPage("/items/item-1/edit");
    const save = await screen.findByRole("button", { name: /^save$/i });

    const review = screen.getByRole("checkbox", {
      name: "Request review to make this question public",
    });
    expect(review).toBeChecked();
    if (clear) await user.click(review);
    await user.click(save);

    await waitFor(() => expect(itemsApi.update).toHaveBeenCalledTimes(1));
    expect(vi.mocked(itemsApi.update).mock.calls[0][1].readyForReview).toBe(expected);
  });

  it.each([
    ["keeps the flag while Private question stays checked", false, true],
    ["sends false once Private question is cleared", true, false],
  ])("admin save %s (#928)", async (_name, makePublic, expected) => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      userId: "admin-1",
      isAdmin: true,
    } as ReturnType<typeof useAuth>);
    vi.mocked(itemsApi.getById).mockResolvedValue({
      ...itemMock,
      readyForReview: true,
    } as Awaited<ReturnType<typeof itemsApi.getById>>);
    renderPage("/items/item-1/edit");
    const save = await screen.findByRole("button", { name: /^save$/i });

    expect(screen.queryByRole("checkbox", { name: /review/i })).not.toBeInTheDocument();
    if (makePublic) await user.click(screen.getByRole("checkbox", { name: "Private question" }));
    await user.click(save);

    await waitFor(() => expect(itemsApi.update).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(itemsApi.update).mock.calls[0][1];
    expect(payload.isPrivate).toBe(!makePublic);
    expect(payload.readyForReview).toBe(expected);
  });

  it("saves as Save does on Enter in a single-line field (#927)", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage("/items/item-1/edit");
    await screen.findByRole("button", { name: /^save$/i });

    await user.type(screen.getByRole("textbox", { name: "Incorrect answer 1" }), "{Enter}");

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/categories"));
    expect(itemsApi.update).toHaveBeenCalledTimes(1);
    expect(vi.mocked(itemsApi.update).mock.calls[0][1].question).toBe("Old question?");
  });

  it("admin user sees isPrivate toggle", async () => {
    // AC 2.1.3
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      userId: "user-1",
      isAdmin: true,
    } as ReturnType<typeof useAuth>);

    renderPage("/items/item-1/edit");

    // Wait for the form to load
    await screen.findByRole("button", { name: /^save$/i });

    // Admin sees the Private question checkbox (enabled)
    const privateCheckbox = screen.getByRole("checkbox", { name: "Private question" });
    expect(privateCheckbox).toBeInTheDocument();
    expect(privateCheckbox).not.toBeDisabled();
  });

  it("shows the owner gate instead of the form for a non-owner (#286)", async () => {
    // AC 2.1.14
    vi.mocked(useCurrentUserIdState).mockReturnValue({
      userId: "someone-else",
      isLoading: false,
      isError: false,
    });

    renderPage("/items/item-1/edit");

    expect(await screen.findByText("You can only edit your own items.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^save$/i })).not.toBeInTheDocument();
  });

  it("does not flash the gate while the current user id is loading (#286)", async () => {
    // AC 2.1.14
    vi.mocked(useCurrentUserIdState).mockReturnValue({
      userId: null,
      isLoading: true,
      isError: false,
    });

    renderPage("/items/item-1/edit");

    expect(await screen.findByText("Loading...")).toBeInTheDocument();
    expect(screen.queryByText("You can only edit your own items.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^save$/i })).not.toBeInTheDocument();
  });

  it("shows the form when the current user id failed to load (#286)", async () => {
    // AC 2.1.14: the server still enforces access
    vi.mocked(useCurrentUserIdState).mockReturnValue({
      userId: null,
      isLoading: false,
      isError: true,
    });

    renderPage("/items/item-1/edit");

    expect(await screen.findByRole("button", { name: /^save$/i })).toBeInTheDocument();
  });

  it("lets an admin who is not the owner edit (#286)", async () => {
    // AC 2.1.14
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      userId: "admin-sub",
      isAdmin: true,
    } as ReturnType<typeof useAuth>);
    vi.mocked(useCurrentUserIdState).mockReturnValue({
      userId: "admin-id",
      isLoading: false,
      isError: false,
    });

    renderPage("/items/item-1/edit");

    expect(await screen.findByRole("button", { name: /^save$/i })).toBeInTheDocument();
  });

  it.each([
    [401, "Your session has expired. Please sign in again."],
    [403, "You can only edit your own items."],
    [404, "This item no longer exists, or you do not have access to it."],
  ])("maps a %s save failure to a clear message without leaving the page (#286)", async (status, message) => {
    // AC 2.1.14
    const user = userEvent.setup({ delay: null });
    vi.mocked(itemsApi.update).mockRejectedValueOnce({
      response: { status, data: { title: "Forbidden" } },
    });

    renderPage("/items/item-1/edit");
    await user.click(await screen.findByRole("button", { name: /^save$/i }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/items/item-1/edit");
  });

  it("explains a duplicate save, keeps values and permits a corrected retry (#466)", async () => {
    const user = userEvent.setup({ delay: null });
    const detail = "An item with the same question already exists in category 'science'. Questions are compared case-insensitively.";
    vi.mocked(itemsApi.update).mockRejectedValueOnce({
      response: { status: 400, data: { title: "Item.Duplicate", detail } },
    });
    renderPage("/items/item-1/edit");
    await user.click(await screen.findByRole("button", { name: /^save$/i }));
    expect(await screen.findByText(detail)).toBeInTheDocument();
    expect(screen.queryByText("Item.Duplicate")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Old question?")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Old answer")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/items/item-1/edit");
    expect(screen.getByRole("button", { name: /^save$/i })).toBeEnabled();
    const question = screen.getByDisplayValue("Old question?");
    await user.clear(question);
    await user.type(question, "Corrected question?");
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(itemsApi.update).toHaveBeenLastCalledWith("item-1", expect.objectContaining({ question: "Corrected question?" })));
    await waitFor(() => expect(screen.queryByText(detail)).not.toBeInTheDocument());
  });

  it("calls update API with correct payload on submit", async () => {
    // AC 2.1.5/2.1.6
    const user = userEvent.setup({ delay: null });

    renderPage("/items/item-1/edit");

    const saveButton = await screen.findByRole("button", { name: /^save$/i });

    await user.click(saveButton);

    await waitFor(() =>
      expect(itemsApi.update).toHaveBeenCalledWith(
        "item-1",
        expect.objectContaining({
          category: "science",
          navigationKeyword1: "anatomy",
          navigationKeyword2: "muscular",
          incorrectAnswers: ["W1", "W2", "W3"],
        })
      )
    );
  });

  it("opens More options for a stored group label and sends it trimmed when changed (#359)", async () => {
    // AC 2.1.17, AC 2.1.18
    const user = userEvent.setup({ delay: null });
    vi.mocked(itemsApi.getById).mockResolvedValueOnce({
      ...itemMock,
      groupLabel: "Mammals",
    } as Awaited<ReturnType<typeof itemsApi.getById>>);

    renderPage("/items/item-1/edit");

    const input = await screen.findByLabelText(/group label \(optional\)/i);
    expect(input).toHaveValue("Mammals");
    expect(screen.getByRole("button", { name: /more options/i })).toHaveAttribute("aria-expanded", "true");

    await user.clear(input);
    await user.type(input, "  Birds ");
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(itemsApi.update).toHaveBeenCalledTimes(1));
    expect(itemsApi.update).toHaveBeenCalledWith("item-1", expect.objectContaining({ groupLabel: "Birds" }));
  });

  it("sends an empty group label to clear a stored one (#359)", async () => {
    // AC 2.1.18
    const user = userEvent.setup({ delay: null });
    vi.mocked(itemsApi.getById).mockResolvedValueOnce({
      ...itemMock,
      groupLabel: "Mammals",
    } as Awaited<ReturnType<typeof itemsApi.getById>>);

    renderPage("/items/item-1/edit");

    await user.clear(await screen.findByLabelText(/group label \(optional\)/i));
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(itemsApi.update).toHaveBeenCalledTimes(1));
    expect(itemsApi.update).toHaveBeenCalledWith("item-1", expect.objectContaining({ groupLabel: "" }));
  });

  it("shows all four incorrect answer fields and keeps all four on save (#265)", async () => {
    // AC 2.1.9
    const user = userEvent.setup({ delay: null });
    vi.mocked(itemsApi.getById).mockResolvedValueOnce({
      ...itemMock,
      incorrectAnswers: ["W1", "W2", "W3", "W4"],
    } as Awaited<ReturnType<typeof itemsApi.getById>>);

    renderPage("/items/item-1/edit");

    const saveButton = await screen.findByRole("button", { name: /^save$/i });

    expect(screen.getByPlaceholderText("Incorrect answer 1")).toHaveValue("W1");
    expect(screen.getByPlaceholderText("Incorrect answer 2")).toHaveValue("W2");
    expect(screen.getByPlaceholderText("Incorrect answer 3")).toHaveValue("W3");
    expect(screen.getByPlaceholderText("Incorrect answer 4")).toHaveValue("W4");
    expect(screen.queryByPlaceholderText("Incorrect answer 5")).toBeNull();

    await user.click(saveButton);

    await waitFor(() => expect(itemsApi.update).toHaveBeenCalledTimes(1));
    expect(itemsApi.update).toHaveBeenCalledWith(
      "item-1",
      expect.objectContaining({ incorrectAnswers: ["W1", "W2", "W3", "W4"] })
    );
  });

  it.each([
    ["a legacy item with repeated incorrect answers", ["x", "X"], "Incorrect answers must be different from each other."],
    ["an incorrect answer equal to the correct answer", ["old ANSWER", "W2"], "Incorrect answers must be different from the correct answer."],
  ])("blocks save for %s (#276)", async (_label, incorrectAnswers, message) => {
    // AC 2.1.8
    const user = userEvent.setup({ delay: null });
    vi.mocked(itemsApi.getById).mockResolvedValueOnce({
      ...itemMock,
      incorrectAnswers,
    } as Awaited<ReturnType<typeof itemsApi.getById>>);

    renderPage("/items/item-1/edit");

    await user.click(await screen.findByRole("button", { name: /^save$/i }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(itemsApi.update).not.toHaveBeenCalled();
  });

  it("keeps three incorrect answer fields for an item with fewer than four (#265)", async () => {
    // AC 2.1.9
    const user = userEvent.setup({ delay: null });
    vi.mocked(itemsApi.getById).mockResolvedValueOnce({
      ...itemMock,
      incorrectAnswers: ["W1"],
    } as Awaited<ReturnType<typeof itemsApi.getById>>);

    renderPage("/items/item-1/edit");

    const saveButton = await screen.findByRole("button", { name: /^save$/i });

    expect(screen.getByPlaceholderText("Incorrect answer 1")).toHaveValue("W1");
    expect(screen.getByPlaceholderText("Incorrect answer 2")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Incorrect answer 3")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Incorrect answer 4")).toBeNull();

    await user.click(saveButton);

    await waitFor(() =>
      expect(itemsApi.update).toHaveBeenCalledWith(
        "item-1",
        expect.objectContaining({ incorrectAnswers: ["W1"] })
      )
    );
  });

  it("drops a cleared 4th answer on save (#265)", async () => {
    // AC 2.1.9
    const user = userEvent.setup({ delay: null });
    vi.mocked(itemsApi.getById).mockResolvedValueOnce({
      ...itemMock,
      incorrectAnswers: ["W1", "W2", "W3", "W4"],
    } as Awaited<ReturnType<typeof itemsApi.getById>>);

    renderPage("/items/item-1/edit");

    const saveButton = await screen.findByRole("button", { name: /^save$/i });

    await user.clear(screen.getByPlaceholderText("Incorrect answer 4"));
    await user.click(saveButton);

    await waitFor(() =>
      expect(itemsApi.update).toHaveBeenCalledWith(
        "item-1",
        expect.objectContaining({ incorrectAnswers: ["W1", "W2", "W3"] })
      )
    );
  });

  it("keeps speech metadata for the 4th incorrect answer (#265)", async () => {
    // AC 2.1.9
    const user = userEvent.setup({ delay: null });
    vi.mocked(itemsApi.getById).mockResolvedValueOnce({
      ...itemMock,
      incorrectAnswers: ["W1", "W2", "W3", "W4"],
      incorrectAnswerSpeech: { 3: { pronunciation: "w4", languageCode: "en-US" } },
    } as unknown as Awaited<ReturnType<typeof itemsApi.getById>>);

    renderPage("/items/item-1/edit");

    const saveButton = await screen.findByRole("button", { name: /^save$/i });

    await user.click(saveButton);

    await waitFor(() => expect(itemsApi.update).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(itemsApi.update).mock.calls[0][1];
    expect(payload.incorrectAnswers).toHaveLength(4);
    expect(payload.incorrectAnswerSpeech).toEqual({
      3: { pronunciation: "w4", languageCode: "en-US" },
    });
  });

  it("re-indexes incorrect-answer speech after a middle answer is cleared (#269)", async () => {
    // AC 3.12.7
    const user = userEvent.setup({ delay: null });
    vi.mocked(itemsApi.getById).mockResolvedValueOnce({
      ...itemMock,
      incorrectAnswers: ["W1", "W2", "W3"],
      incorrectAnswerSpeech: {
        0: { pronunciation: "w1" },
        1: { pronunciation: "w2" },
        2: { pronunciation: "w3", languageCode: "ja-JP" },
      },
    } as unknown as Awaited<ReturnType<typeof itemsApi.getById>>);

    renderPage("/items/item-1/edit");

    const saveButton = await screen.findByRole("button", { name: /^save$/i });

    await user.clear(screen.getByPlaceholderText("Incorrect answer 2"));
    await user.click(saveButton);

    await waitFor(() => expect(itemsApi.update).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(itemsApi.update).mock.calls[0][1];
    expect(payload.incorrectAnswers).toEqual(["W1", "W3"]);
    expect(payload.incorrectAnswerSpeech).toEqual({
      0: { pronunciation: "w1" },
      1: { pronunciation: "w3", languageCode: "ja-JP" },
    });
    expect(Object.values(payload.incorrectAnswerSpeech ?? {}).map((x) => x.pronunciation)).not.toContain("w2");
  });

  describe("re-review of public items (#290)", () => {
    const NOTICE = "Saving changes will make this item private again until an administrator approves it.";
    const publicItem = { ...itemMock, isPrivate: false };

    it("warns a non-admin owner of a public item before saving", async () => {
      // AC 2.1.6
      vi.mocked(itemsApi.getById).mockResolvedValue(
        publicItem as Awaited<ReturnType<typeof itemsApi.getById>>
      );
      renderPage("/items/item-1/edit");
      await screen.findByRole("button", { name: /^save$/i });
      expect(screen.getByText(NOTICE)).toBeInTheDocument();
    });

    it("keeps the notice and review checkbox without the private sentence, and saves the same request (AC 2.1.4, AC 2.1.6, #901)", async () => {
      const user = userEvent.setup({ delay: null });
      vi.mocked(itemsApi.getById).mockResolvedValue(
        publicItem as Awaited<ReturnType<typeof itemsApi.getById>>
      );
      renderPage("/items/item-1/edit");
      const save = await screen.findByRole("button", { name: /^save$/i });

      expect(screen.getByText(NOTICE)).toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", { name: "Request review to make this question public" })
      ).not.toBeChecked();
      expect(screen.queryByRole("checkbox", { name: /private/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/not listed in public categories or search/i)).not.toBeInTheDocument();

      await user.click(save);

      await waitFor(() => expect(itemsApi.update).toHaveBeenCalledTimes(1));
      expect(vi.mocked(itemsApi.update).mock.calls[0][1]).toStrictEqual({
        category: "science",
        navigationKeyword1: "anatomy",
        navigationKeyword2: "muscular",
        isPrivate: false,
        question: "Old question?",
        questionSpeech: undefined,
        correctAnswer: "Old answer",
        correctAnswerSpeech: undefined,
        incorrectAnswers: ["W1", "W2", "W3"],
        incorrectAnswerSpeech: undefined,
        incorrectAnswerRationale: undefined,
        explanation: "Old explanation",
        expectedImageRevision: undefined,
        questionImage: undefined,
        explanationImage: undefined,
        keywords: [],
        source: undefined,
        groupLabel: "",
        readyForReview: false,
      });
    });

    it("shows no notice for a private item", async () => {
      // AC 2.1.6
      renderPage("/items/item-1/edit");
      await screen.findByRole("button", { name: /^save$/i });
      expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
    });

    it("shows no notice for an admin editing a public item", async () => {
      // AC 2.1.6
      vi.mocked(useAuth).mockReturnValue({
        isAuthenticated: true,
        userId: "user-1",
        isAdmin: true,
      } as ReturnType<typeof useAuth>);
      vi.mocked(itemsApi.getById).mockResolvedValue(
        publicItem as Awaited<ReturnType<typeof itemsApi.getById>>
      );
      renderPage("/items/item-1/edit");
      await screen.findByRole("button", { name: /^save$/i });
      expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
    });

    it("tells the owner the item is now private after saving", async () => {
      // AC 2.1.6
      const user = userEvent.setup({ delay: null });
      vi.mocked(itemsApi.getById).mockResolvedValue(
        publicItem as Awaited<ReturnType<typeof itemsApi.getById>>
      );
      renderPage("/items/item-1/edit");
      await user.click(await screen.findByRole("button", { name: /^save$/i }));
      expect(await screen.findByRole("status")).toHaveTextContent(/now private again/i);
      expect(screen.getByRole("button", { name: /back to categories/i })).toBeInTheDocument();
    });
  });
});

describe("EditItemPage topic (#323)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      userId: "user-1",
      isAdmin: false,
    } as ReturnType<typeof useAuth>);
    vi.mocked(useCurrentUserIdState).mockReturnValue({ userId: "user-1", isLoading: false, isError: false });
    vi.mocked(taxonomyApi.getAll).mockResolvedValue(
      taxonomyMock as Awaited<ReturnType<typeof taxonomyApi.getAll>>
    );
    vi.mocked(taxonomyApi.suggest).mockResolvedValue({ suggestions: [] });
    vi.mocked(itemsApi.getById).mockResolvedValue(itemMock as Awaited<ReturnType<typeof itemsApi.getById>>);
    vi.mocked(itemsApi.update).mockResolvedValue({} as Awaited<ReturnType<typeof itemsApi.update>>);
  });

  it("shows the stored path as a pill, offers no chips and sends no suggest request", async () => {
    // AC 12.11
    renderPage("/items/item-1/edit");
    await screen.findByRole("button", { name: /^save$/i });

    expect(await screen.findByTestId("topic-pill")).toHaveTextContent("science");
    expect(screen.queryByTestId("topic-chip")).not.toBeInTheDocument();
    expect(taxonomyApi.suggest).not.toHaveBeenCalled();
  });

  it("lets the owner change the topic through the picker after removing the pill", async () => {
    // AC 12.13
    const user = userEvent.setup({ delay: null });
    renderPage("/items/item-1/edit");
    await screen.findByRole("button", { name: /^save$/i });

    await user.click(await screen.findByRole("button", { name: /remove topic science, anatomy, muscular/i }));
    const search = screen.getByRole("combobox", { name: /search topics/i });
    expect(search).toHaveFocus();
    expect(screen.queryByTestId("topic-pill")).not.toBeInTheDocument();

    // Saving without a topic is blocked with the topic copy.
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(
      await screen.findByText(/choose a topic: pick a suggestion, search, or browse all topics/i)
    ).toBeInTheDocument();
    expect(itemsApi.update).not.toHaveBeenCalled();

    await user.type(search, "muscular");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(await screen.findByTestId("topic-pill")).toBeInTheDocument();
    expect(taxonomyApi.suggest).not.toHaveBeenCalled();
  });
});
