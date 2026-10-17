import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import type { IdeaSummaryResponse } from "@/api/ideas";
import IdeasPage from "./IdeasPage";

const { mockUseAuth, mockIdeasApi } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockIdeasApi: {
    getBoard: vi.fn(),
    getMine: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    updateStatus: vi.fn(),
    setRating: vi.fn(),
    getComments: vi.fn(),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/api/ideas", () => ({
  ideasApi: mockIdeasApi,
}));

vi.mock("../components/TurnstileWidget", () => ({
  default: () => null,
}));

function makeIdea(overrides: Partial<IdeaSummaryResponse>): IdeaSummaryResponse {
  return {
    id: "idea",
    title: "Idea title",
    problem: "Learners lose context between study sessions.",
    proposedChange: "Add resumable sessions with a quick continue action.",
    tradeOffs: null,
    status: "Proposed",
    moderationState: "Published",
    moderationNotes: null,
    authorName: "Quizymode",
    reviewedByName: null,
    createdAt: "2026-04-01T10:00:00Z",
    updatedAt: "2026-04-02T10:00:00Z",
    reviewedAt: null,
    commentCount: 0,
    ratingCount: 0,
    averageStars: null,
    myRating: null,
    canEdit: false,
    canDelete: false,
    canChangeStatus: false,
    ...overrides,
  };
}

function apiError(status: number, title: string, detail: string) {
  const error = new AxiosError("Request failed");
  error.response = {
    status,
    statusText: "",
    headers: {},
    config: {} as never,
    data: { title, detail },
  };
  return error;
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <IdeasPage />
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

describe("IdeasPage interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isAdmin: false });
    mockIdeasApi.getMine.mockResolvedValue({ ideas: [] });
    mockIdeasApi.getComments.mockResolvedValue({ comments: [] });
    mockIdeasApi.delete.mockResolvedValue(undefined);
    mockIdeasApi.update.mockResolvedValue({});
    mockIdeasApi.updateStatus.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("filters the board by search text across idea fields", async () => {
    const user = userEvent.setup();
    mockIdeasApi.getBoard.mockResolvedValue({
      ideas: [
        makeIdea({ id: "a", title: "Resumable sessions" }),
        makeIdea({
          id: "b",
          title: "Dark mode",
          problem: "Bright screens hurt at night.",
          proposedChange: "Add a dark theme.",
        }),
      ],
    });
    renderPage();

    await screen.findByText("Resumable sessions");
    expect(screen.getByText("Dark mode")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/search ideas/i), "bright screens");

    expect(screen.queryByText("Resumable sessions")).not.toBeInTheDocument();
    expect(screen.getByText("Dark mode")).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/search ideas/i));
    await user.type(screen.getByLabelText(/search ideas/i), "no such idea anywhere");
    expect(screen.getByText("No ideas match that search yet.")).toBeInTheDocument();
  });

  it("switches between recently updated and top rated ordering", async () => {
    const user = userEvent.setup();
    mockIdeasApi.getBoard.mockResolvedValue({
      ideas: [
        makeIdea({
          id: "recent",
          title: "Recent but unrated",
          updatedAt: "2026-05-01T10:00:00Z",
        }),
        makeIdea({
          id: "rated",
          title: "Older but loved",
          updatedAt: "2026-03-01T10:00:00Z",
          averageStars: 5,
          ratingCount: 9,
        }),
      ],
    });
    renderPage();

    await screen.findByText("Recent but unrated");
    const titles = () =>
      screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);

    expect(titles().indexOf("Recent but unrated")).toBeLessThan(
      titles().indexOf("Older but loved")
    );

    await user.selectOptions(screen.getByRole("combobox"), "rating");

    expect(titles().indexOf("Older but loved")).toBeLessThan(
      titles().indexOf("Recent but unrated")
    );
  });

  it("deletes an owned idea after confirmation", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockIdeasApi.getBoard.mockResolvedValue({
      ideas: [makeIdea({ id: "mine", title: "My own idea", canEdit: true, canDelete: true })],
    });
    renderPage();

    await screen.findByText("My own idea");
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(mockIdeasApi.delete).toHaveBeenCalledWith("mine"));
  });

  it("does not delete when the confirmation is dismissed", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    mockIdeasApi.getBoard.mockResolvedValue({
      ideas: [makeIdea({ id: "mine", title: "My own idea", canEdit: true, canDelete: true })],
    });
    renderPage();

    await screen.findByText("My own idea");
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    expect(mockIdeasApi.delete).not.toHaveBeenCalled();
  });

  it("shows an action error banner when deleting fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockIdeasApi.delete.mockRejectedValue(
      apiError(500, "Ideas.DeleteFailed", "Could not delete")
    );
    mockIdeasApi.getBoard.mockResolvedValue({
      ideas: [makeIdea({ id: "mine", title: "My own idea", canEdit: true, canDelete: true })],
    });
    renderPage();

    await screen.findByText("My own idea");
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    expect(await screen.findByText("Idea action failed")).toBeInTheDocument();
    expect(screen.getByText("[500] Could not delete")).toBeInTheDocument();
  });

  it("opens the edit modal prefilled and saves the trimmed changes", async () => {
    const user = userEvent.setup();
    mockIdeasApi.getBoard.mockResolvedValue({
      ideas: [
        makeIdea({
          id: "mine",
          title: "My own idea",
          tradeOffs: "Some cost to remember.",
          canEdit: true,
          canDelete: true,
        }),
      ],
    });
    renderPage();

    await screen.findByText("My own idea");
    await user.click(screen.getByRole("button", { name: /^edit$/i }));

    const titleInput = screen.getByLabelText(/^title$/i);
    expect(titleInput).toHaveValue("My own idea");
    await user.clear(titleInput);
    await user.type(titleInput, "  Renamed idea  ");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(mockIdeasApi.update).toHaveBeenCalledWith("mine", {
        title: "Renamed idea",
        problem: "Learners lose context between study sessions.",
        proposedChange: "Add resumable sessions with a quick continue action.",
        tradeOffs: "Some cost to remember.",
      })
    );
  });

  it("shows the server error inside the edit modal when saving fails", async () => {
    const user = userEvent.setup();
    mockIdeasApi.update.mockRejectedValue(
      apiError(400, "Something.Else", "Idea could not be saved")
    );
    mockIdeasApi.getBoard.mockResolvedValue({
      ideas: [makeIdea({ id: "mine", title: "My own idea", canEdit: true })],
    });
    renderPage();

    await screen.findByText("My own idea");
    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("[400] Idea could not be saved")).toBeInTheDocument();
  });

  it("lets an admin change lifecycle status from the board", async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isAdmin: true });
    mockIdeasApi.getBoard.mockResolvedValue({
      ideas: [
        makeIdea({ id: "road", title: "Roadmap idea", canChangeStatus: true }),
      ],
    });
    renderPage();

    await screen.findByText("Roadmap idea");
    await user.click(screen.getByRole("button", { name: /^open$/i }));

    const select = screen.getByDisplayValue("Proposed");
    await user.selectOptions(select, "Planned");

    await waitFor(() =>
      expect(mockIdeasApi.updateStatus).toHaveBeenCalledWith("road", {
        status: "Planned",
      })
    );
  });

  it("renders an error state with retry when the board fails to load", async () => {
    mockIdeasApi.getBoard.mockRejectedValue(
      apiError(500, "Ideas.GetPublicFailed", "Board unavailable")
    );
    renderPage();

    expect(await screen.findByText("Failed to load the ideas board")).toBeInTheDocument();
    expect(screen.getByText("[500] Board unavailable")).toBeInTheDocument();
  });

  it("renders an error state when My submissions fails to load", async () => {
    mockIdeasApi.getBoard.mockResolvedValue({ ideas: [] });
    mockIdeasApi.getMine.mockRejectedValue(
      apiError(500, "Ideas.GetMineFailed", "Mine unavailable")
    );
    renderPage();

    expect(
      await screen.findByText("Failed to load your idea submissions")
    ).toBeInTheDocument();
  });

  it("shows the empty state for My submissions", async () => {
    mockIdeasApi.getBoard.mockResolvedValue({ ideas: [] });
    renderPage();

    expect(
      await screen.findByText("You have not submitted any ideas yet.")
    ).toBeInTheDocument();
  });
});
