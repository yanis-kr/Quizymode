import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import UploadToCollectionPage from "./UploadToCollectionPage";
import { itemsApi } from "@/api/items";
import { taxonomyApi } from "@/api/taxonomy";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: true }),
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
});
