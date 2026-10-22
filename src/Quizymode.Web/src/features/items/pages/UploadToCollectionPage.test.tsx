import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import UploadToCollectionPage from "./UploadToCollectionPage";
import { itemsApi } from "@/api/items";
import { taxonomyApi } from "@/api/taxonomy";

const authState = vi.hoisted(() => ({ isAdmin: false }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: true, isAdmin: authState.isAdmin }),
}));

vi.mock("@/api/items", () => ({
  itemsApi: {
    uploadToCollection: vi.fn(),
  },
}));

vi.mock("@/api/taxonomy", () => ({
  taxonomyApi: {
    getAll: vi.fn(),
  },
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
            path="/items/upload-to-collection"
            element={
              <>
                <UploadToCollectionPage />
                <LocationDisplay />
              </>
            }
          />
          <Route
            path="/explore/collections/:collectionId"
            element={<LocationDisplay />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("UploadToCollectionPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isAdmin = false;

    vi.mocked(taxonomyApi.getAll).mockResolvedValue(
      taxonomyMock as Awaited<ReturnType<typeof taxonomyApi.getAll>>
    );

    vi.mocked(itemsApi.uploadToCollection).mockResolvedValue(
      { collectionId: "col-123", name: "abc", itemCount: 2 } as Awaited<
        ReturnType<typeof itemsApi.uploadToCollection>
      >
    );
  });

  it("shows the upload form with category and keyword selectors", async () => {
    // AC 2.6.5
    renderPage("/items/upload-to-collection");

    const categorySelect = await screen.findByLabelText(/category \(required\)/i);
    expect(categorySelect).toBeInTheDocument();

    expect(screen.getByLabelText(/keyword rank 1/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/keyword rank 2/i)).toBeInTheDocument();
  });

  it("pre-fills category and keywords from URL params", async () => {
    // AC 2.6.5
    renderPage("/items/upload-to-collection?category=science&keywords=anatomy,muscular");

    const categorySelect = await screen.findByLabelText(/category \(required\)/i);
    const rank1Select = screen.getByLabelText(/keyword rank 1/i);
    const rank2Select = screen.getByLabelText(/keyword rank 2/i);

    await waitFor(() => {
      expect(categorySelect).toHaveValue("science");
      expect(rank1Select).toHaveValue("anatomy");
      expect(rank2Select).toHaveValue("muscular");
    });
  });

  it("navigates to new collection on successful upload", async () => {
    // AC 2.6.6
    const user = userEvent.setup({ delay: null });

    renderPage("/items/upload-to-collection?category=science&keywords=anatomy,muscular");

    const categorySelect = await screen.findByLabelText(/category \(required\)/i);
    const rank1Select = screen.getByLabelText(/keyword rank 1/i);
    const rank2Select = screen.getByLabelText(/keyword rank 2/i);

    await waitFor(() => {
      expect(categorySelect).toHaveValue("science");
      expect(rank1Select).toHaveValue("anatomy");
      expect(rank2Select).toHaveValue("muscular");
    });

    const jsonInput = screen.getByLabelText(/json array of items/i);
    await user.click(jsonInput);
    await user.paste(
      JSON.stringify([
        { question: "Q", correctAnswer: "A", incorrectAnswers: ["W1", "W2", "W3"] },
      ])
    );

    const submitButton = screen.getByRole("button", { name: /upload and open collection/i });
    await user.click(submitButton);

    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/explore/collections/col-123")
    );
  });

  it("shows error message on duplicate upload", async () => {
    // AC 2.6.7
    const user = userEvent.setup({ delay: null });

    const duplicateError = Object.assign(new Error("already uploaded"), {
      response: { status: 409, data: { detail: "already uploaded" } },
    });
    vi.mocked(itemsApi.uploadToCollection).mockRejectedValue(duplicateError);

    renderPage("/items/upload-to-collection?category=science&keywords=anatomy,muscular");

    await screen.findByLabelText(/category \(required\)/i);

    await waitFor(() => {
      expect(screen.getByLabelText(/keyword rank 1/i)).toHaveValue("anatomy");
    });

    const jsonInput = screen.getByLabelText(/json array of items/i);
    await user.click(jsonInput);
    await user.paste(
      JSON.stringify([
        { question: "Q", correctAnswer: "A", incorrectAnswers: ["W1", "W2", "W3"] },
      ])
    );

    const submitButton = screen.getByRole("button", { name: /upload and open collection/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/already uploaded/i)).toBeInTheDocument();
    });
  });
  it("blocks submit with a row-numbered error when a row has no non-blank incorrect answer", async () => {
    // AC 2.6.8
    const user = userEvent.setup({ delay: null });
    renderPage("/items/upload-to-collection?category=science&keywords=anatomy,muscular");
    await screen.findByLabelText(/category \(required\)/i);
    await waitFor(() => {
      expect(screen.getByLabelText(/keyword rank 1/i)).toHaveValue("anatomy");
    });

    await user.click(screen.getByLabelText(/json array of items/i));
    await user.paste(
      JSON.stringify([
        { question: "Q1", correctAnswer: "A", incorrectAnswers: ["W1"] },
        { question: "Q2", correctAnswer: "A", incorrectAnswers: ["  ", ""] },
        { question: "Q3", correctAnswer: "A" },
      ])
    );
    await user.click(screen.getByRole("button", { name: /upload and open collection/i }));

    expect(await screen.findByText(/items 2, 3: provide at least one non-blank incorrect answer/i)).toBeInTheDocument();
    expect(itemsApi.uploadToCollection).not.toHaveBeenCalled();
  });

  it("blocks submit with a row-numbered error when incorrect answers repeat or equal the correct answer (#276)", async () => {
    // AC 2.6.8
    const user = userEvent.setup({ delay: null });
    renderPage("/items/upload-to-collection?category=science&keywords=anatomy,muscular");
    await screen.findByLabelText(/category \(required\)/i);
    await waitFor(() => {
      expect(screen.getByLabelText(/keyword rank 1/i)).toHaveValue("anatomy");
    });

    await user.click(screen.getByLabelText(/json array of items/i));
    await user.paste(
      JSON.stringify([
        { question: "Q1", correctAnswer: "A", incorrectAnswers: ["W1", "W2"] },
        { question: "Q2", correctAnswer: "A", incorrectAnswers: ["W1", " w1 "] },
        { question: "Q3", correctAnswer: "A", incorrectAnswers: ["a"] },
      ])
    );
    await user.click(screen.getByRole("button", { name: /upload and open collection/i }));

    expect(
      await screen.findByText(
        /items 2, 3: incorrect answers must be different from each other and from the correct answer/i
      )
    ).toBeInTheDocument();
    expect(itemsApi.uploadToCollection).not.toHaveBeenCalled();
  });

  it("trims incorrect answers and keeps at most four before uploading", async () => {
    // AC 2.6.8
    const user = userEvent.setup({ delay: null });
    renderPage("/items/upload-to-collection?category=science&keywords=anatomy,muscular");
    await screen.findByLabelText(/category \(required\)/i);
    await waitFor(() => {
      expect(screen.getByLabelText(/keyword rank 1/i)).toHaveValue("anatomy");
    });

    await user.click(screen.getByLabelText(/json array of items/i));
    await user.paste(
      JSON.stringify([
        { question: "Q", correctAnswer: "A", incorrectAnswers: [" W1 ", "", "W2", "W3", "W4", "W5"] },
      ])
    );
    await user.click(screen.getByRole("button", { name: /upload and open collection/i }));

    await waitFor(() => expect(itemsApi.uploadToCollection).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(itemsApi.uploadToCollection).mock.calls[0][0];
    expect(payload.items[0].incorrectAnswers).toEqual(["W1", "W2", "W3", "W4"]);
  });

  it("asks for 1-4 incorrect answers in the prompt", async () => {
    // AC 2.6.8
    renderPage("/items/upload-to-collection");
    await screen.findByLabelText(/category \(required\)/i);
    expect(document.body.textContent).toContain('1–4 "incorrectAnswers"');
  });

  describe("Paste text tab (#257)", () => {
    const rows = ["cat\tgato", "dog\tperro", "bird\tpajaro", "fish\tpez"].join("\n");

    async function openPasteTab(user: ReturnType<typeof userEvent.setup>) {
      renderPage("/items/upload-to-collection?category=science&keywords=anatomy,muscular");
      await screen.findByLabelText(/category \(required\)/i);
      await waitFor(() => expect(screen.getByLabelText(/keyword rank 2/i)).toHaveValue("muscular"));
      await user.click(screen.getByRole("tab", { name: /paste text/i }));
    }

    it("previews parsed rows and uploads built items", async () => {
      // AC 2.6.9
      const user = userEvent.setup({ delay: null });
      await openPasteTab(user);
      expect(screen.queryByLabelText(/json array of items/i)).not.toBeInTheDocument();

      await user.click(screen.getByLabelText(/pasted text/i));
      await user.paste(rows);
      expect(await screen.findByText(/4 items ready/i)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /upload and open collection/i }));
      await waitFor(() => expect(itemsApi.uploadToCollection).toHaveBeenCalledTimes(1));
      const payload = vi.mocked(itemsApi.uploadToCollection).mock.calls[0][0];
      expect(payload.category).toBe("science");
      expect(payload.items).toHaveLength(4);
      expect(payload.items[0]).toMatchObject({ question: "cat", correctAnswer: "gato", isPrivate: true });
      expect(payload.items[0].incorrectAnswers).toHaveLength(3);
      await waitFor(() =>
        expect(screen.getByTestId("location")).toHaveTextContent("/explore/collections/col-123")
      );
    });

    it("applies direction and template", async () => {
      // AC 2.6.9
      const user = userEvent.setup({ delay: null });
      await openPasteTab(user);
      await user.click(screen.getByLabelText(/pasted text/i));
      await user.paste(rows);
      await user.selectOptions(screen.getByLabelText(/direction/i), "definition-to-term");
      await user.clear(screen.getByLabelText(/question template/i));
      await user.click(screen.getByLabelText(/question template/i));
      await user.paste("Translate: {term}");
      await user.click(screen.getByRole("button", { name: /upload and open collection/i }));
      await waitFor(() => expect(itemsApi.uploadToCollection).toHaveBeenCalled());
      const first = vi.mocked(itemsApi.uploadToCollection).mock.calls[0][0].items[0];
      expect(first.question).toBe("Translate: gato");
      expect(first.correctAnswer).toBe("cat");
    });

    it("blocks upload and explains when fewer than 4 rows are usable", async () => {
      // AC 2.6.9
      const user = userEvent.setup({ delay: null });
      await openPasteTab(user);
      await user.click(screen.getByLabelText(/pasted text/i));
      fireEvent.change(screen.getByLabelText(/pasted text/i), { target: { value: "cat\tgato\ndog\tperro" } });
      expect(await screen.findByText(/at least 4 usable rows are needed to build/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /upload and open collection/i })).toBeDisabled();
    });

    it("warns that only the first 100 items are imported for non-admins", async () => {
      // AC 2.6.9
      const user = userEvent.setup({ delay: null });
      await openPasteTab(user);
      const many = Array.from({ length: 120 }, (_, i) => `t${i}\td${i}`).join("\n");
      fireEvent.change(screen.getByLabelText(/pasted text/i), { target: { value: many } });
      expect(await screen.findByText(/only the first 100 will be imported/i)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /upload and open collection/i }));
      await waitFor(() => expect(itemsApi.uploadToCollection).toHaveBeenCalled());
      expect(vi.mocked(itemsApi.uploadToCollection).mock.calls[0][0].items).toHaveLength(100);
    });

    it("allows up to 1000 items for admins and warns above that", async () => {
      // AC 2.6.9
      authState.isAdmin = true;
      const user = userEvent.setup({ delay: null });
      await openPasteTab(user);
      const lines = (n: number) => Array.from({ length: n }, (_, i) => `t${i}\td${i}`).join("\n");
      fireEvent.change(screen.getByLabelText(/pasted text/i), { target: { value: lines(150) } });
      expect(await screen.findByText(/150 items ready/i)).toBeInTheDocument();
      expect(screen.queryByText(/only the first/i)).not.toBeInTheDocument();
      fireEvent.change(screen.getByLabelText(/pasted text/i), { target: { value: lines(1100) } });
      expect(await screen.findByText(/only the first 1000 will be imported/i)).toBeInTheDocument();
    });

    it("moves between the two tabs with the arrow keys using roving tabindex", async () => {
      // AC 2.6.9
      const user = userEvent.setup({ delay: null });
      renderPage("/items/upload-to-collection");
      await screen.findByLabelText(/category \(required\)/i);
      const jsonTab = screen.getByRole("tab", { name: "JSON" });
      const pasteTab = screen.getByRole("tab", { name: /paste text/i });
      expect(jsonTab).toHaveAttribute("tabindex", "0");
      expect(pasteTab).toHaveAttribute("tabindex", "-1");
      jsonTab.focus();
      await user.keyboard("{ArrowRight}");
      expect(pasteTab).toHaveFocus();
      expect(pasteTab).toHaveAttribute("aria-selected", "true");
      await user.keyboard("{ArrowLeft}");
      expect(jsonTab).toHaveFocus();
      expect(jsonTab).toHaveAttribute("aria-selected", "true");
    });

    it("requires a category before uploading", async () => {
      // AC 2.6.9
      const user = userEvent.setup({ delay: null });
      renderPage("/items/upload-to-collection");
      await screen.findByLabelText(/category \(required\)/i);
      await user.click(screen.getByRole("tab", { name: /paste text/i }));
      fireEvent.change(screen.getByLabelText(/pasted text/i), { target: { value: rows } });
      await user.click(screen.getByRole("button", { name: /upload and open collection/i }));
      expect(await screen.findByText(/please select a category/i)).toBeInTheDocument();
      expect(itemsApi.uploadToCollection).not.toHaveBeenCalled();
    });
  });
});
