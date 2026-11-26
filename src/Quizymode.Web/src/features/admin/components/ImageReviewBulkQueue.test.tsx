import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ImageReviewBulkQueue, PICTURE_POLICY_URL } from "./ImageReviewBulkQueue";

const { mockAdminApi } = vi.hoisted(() => ({
  mockAdminApi: {
    getImageReviewQueue: vi.fn(),
    setImageReviewBulk: vi.fn(),
    fetchItemImageBlob: vi.fn(),
  },
}));

vi.mock("@/api/admin", () => ({ adminApi: mockAdminApi }));

function row(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    category: "geography",
    isPrivate: false,
    readyForReview: false,
    question: `Question ${id}`,
    correctAnswer: "France",
    incorrectAnswers: ["Italy"],
    incorrectAnswerRationale: null,
    explanation: "",
    createdBy: "user-1",
    questionImage: { revision: 4, key: `media:${id}`, altText: `Picture ${id}`, attribution: null },
    explanationImage: null,
    imageReview: {
      state: "PendingReview",
      revision: 4,
      submittedBy: "user-1",
      submittedByDisplay: "owner@example.com",
      submittedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    },
    ageSeconds: 7200,
    ...overrides,
  };
}

function queue(items: unknown[], totalCount = items.length) {
  return {
    items,
    totalCount,
    page: 1,
    pageSize: 25,
    totalPages: 1,
    oldestSubmittedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  };
}

function renderQueue() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ImageReviewBulkQueue />
    </QueryClientProvider>,
  );
}

describe("ImageReviewBulkQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminApi.fetchItemImageBlob.mockResolvedValue(new Blob(["x"], { type: "image/webp" }));
    URL.createObjectURL = vi.fn(() => "blob:test-url");
    URL.revokeObjectURL = vi.fn();
  });

  it("shows the count, the policy link and one checkbox per picture", async () => {
    mockAdminApi.getImageReviewQueue.mockResolvedValue(queue([row("a"), row("b")]));
    renderQueue();

    expect(await screen.findByText("2 picture submissions waiting for review")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Picture policy/ })).toHaveAttribute("href", PICTURE_POLICY_URL);
    expect(screen.getByRole("checkbox", { name: "Select picture for: Question a" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select picture for: Question b" })).not.toBeChecked();
    expect(screen.getByText("0 selected")).toBeInTheDocument();
  });

  it("Select all on this page and Deselect all update the selection", async () => {
    const user = userEvent.setup();
    mockAdminApi.getImageReviewQueue.mockResolvedValue(queue([row("a"), row("b"), row("c")]));
    renderQueue();
    await screen.findByText("3 picture submissions waiting for review");

    await user.click(screen.getByRole("button", { name: "Select all on this page" }));
    expect(screen.getByText("3 selected")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select picture for: Question b" })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(screen.getByText("0 selected")).toBeInTheDocument();
  });

  it("approves the ticked pictures with the revision each one showed", async () => {
    const user = userEvent.setup();
    mockAdminApi.getImageReviewQueue.mockResolvedValue(queue([row("a"), row("b", { imageReview: { ...row("b").imageReview, revision: 9 } })]));
    mockAdminApi.setImageReviewBulk.mockResolvedValue({ applied: 2, failed: 0, results: [] });
    renderQueue();
    await screen.findByText("2 picture submissions waiting for review");

    await user.click(screen.getByRole("button", { name: "Select all on this page" }));
    await user.click(screen.getByRole("button", { name: "Approve selected (2)" }));

    await waitFor(() =>
      expect(mockAdminApi.setImageReviewBulk).toHaveBeenCalledWith({
        decision: "approve",
        reason: undefined,
        items: [
          { id: "a", expectedRevision: 4 },
          { id: "b", expectedRevision: 9 },
        ],
      }),
    );
    expect(await screen.findByText("Approved 2.")).toBeInTheDocument();
  });

  it("keeps Reject disabled until a reason is typed, then rejects with the trimmed reason", async () => {
    const user = userEvent.setup();
    mockAdminApi.getImageReviewQueue.mockResolvedValue(queue([row("a")]));
    mockAdminApi.setImageReviewBulk.mockResolvedValue({ applied: 1, failed: 0, results: [] });
    renderQueue();
    await screen.findByText("1 picture submission waiting for review");

    await user.click(screen.getByRole("checkbox", { name: "Select picture for: Question a" }));
    const reject = screen.getByRole("button", { name: "Reject selected (1)" });
    expect(reject).toBeDisabled();

    await user.type(screen.getByLabelText(/Reason for rejection/), "  Shows a face  ");
    expect(reject).toBeEnabled();
    await user.click(reject);

    await waitFor(() =>
      expect(mockAdminApi.setImageReviewBulk).toHaveBeenCalledWith({
        decision: "reject",
        reason: "Shows a face",
        items: [{ id: "a", expectedRevision: 4 }],
      }),
    );
  });

  it("reports pictures that could not be applied and keeps them in the queue", async () => {
    const user = userEvent.setup();
    mockAdminApi.getImageReviewQueue.mockResolvedValue(queue([row("a"), row("b")]));
    mockAdminApi.setImageReviewBulk.mockResolvedValue({ applied: 1, failed: 1, results: [] });
    renderQueue();
    await screen.findByText("2 picture submissions waiting for review");

    await user.click(screen.getByRole("button", { name: "Select all on this page" }));
    await user.click(screen.getByRole("button", { name: "Approve selected (2)" }));

    expect(
      await screen.findByText(/Approved 1\. 1 could not be applied because the picture changed or is unavailable; they are still in the queue\./),
    ).toBeInTheDocument();
  });

  it("shows the empty state when nothing is waiting", async () => {
    mockAdminApi.getImageReviewQueue.mockResolvedValue(queue([], 0));
    renderQueue();
    expect(await screen.findByText("No pictures waiting for review")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Select all on this page" })).not.toBeInTheDocument();
  });

  it("shows an error with retry when the queue fails to load", async () => {
    mockAdminApi.getImageReviewQueue.mockRejectedValue(new Error("down"));
    renderQueue();
    expect(await screen.findByText("Failed to load the picture review queue")).toBeInTheDocument();
  });

  it("notes when only the first page is shown", async () => {
    mockAdminApi.getImageReviewQueue.mockResolvedValue(queue([row("a")], 40));
    renderQueue();
    expect(await screen.findByText("Showing the oldest 1 of 40. Decide these to load the next ones.")).toBeInTheDocument();
  });

  it("lays the pictures out in a grid", async () => {
    mockAdminApi.getImageReviewQueue.mockResolvedValue(queue([row("a"), row("b")]));
    renderQueue();
    await screen.findByText("2 picture submissions waiting for review");
    const grid = screen.getByRole("list");
    expect(grid.className).toContain("md:grid-cols-5");
    expect(within(grid).getAllByRole("listitem")).toHaveLength(2);
  });

  it("keeps the decision panel in the page flow so it never covers a tile's question text (AC 3.30.4)", async () => {
    mockAdminApi.getImageReviewQueue.mockResolvedValue(queue([row("a"), row("b")]));
    renderQueue();
    await screen.findByText("2 picture submissions waiting for review");
    const panel = screen.getByLabelText(/Reason for rejection/).parentElement!;
    expect(panel.className).not.toMatch(/sticky|fixed/);
  });
  it("shows a loading placeholder, then the picture; a failed fetch shows a message with Retry (AC 3.30.5)", async () => {
    let resolveBlob: (b: Blob) => void = () => {};
    mockAdminApi.fetchItemImageBlob.mockReturnValueOnce(new Promise<Blob>((resolve) => { resolveBlob = resolve; }));
    mockAdminApi.getImageReviewQueue.mockResolvedValue(queue([row("a")]));
    renderQueue();
    expect(await screen.findByLabelText("Loading picture")).toBeInTheDocument();
    resolveBlob(new Blob(["x"], { type: "image/webp" }));
    await waitFor(() => expect(screen.queryByLabelText("Loading picture")).not.toBeInTheDocument());

  });

  it("offers Retry when the picture fetch fails (AC 3.30.5)", async () => {
    mockAdminApi.fetchItemImageBlob.mockRejectedValueOnce(new Error("boom"));
    mockAdminApi.getImageReviewQueue.mockResolvedValue(queue([row("a")]));
    renderQueue();
    expect(await screen.findByText("Picture could not be loaded")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(mockAdminApi.fetchItemImageBlob).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("Picture could not be loaded")).not.toBeInTheDocument());
  });

  it("enlarges a picture in a dialog that Esc, the close button and the backdrop dismiss, returning focus (AC 3.26.3)", async () => {
    const user = userEvent.setup();
    mockAdminApi.getImageReviewQueue.mockResolvedValue(queue([row("a")]));
    renderQueue();
    const enlarge = await screen.findByRole("button", { name: "Enlarge question picture" });

    await user.click(enlarge);
    const dialog = screen.getByRole("dialog", { name: "Question picture" });
    expect(within(dialog).getByRole("button", { name: "Close picture" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(enlarge).toHaveFocus();

    await user.click(enlarge);
    await user.click(screen.getByRole("button", { name: "Close picture" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(enlarge);
    await user.click(screen.getByRole("dialog").parentElement!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("revokes the picture's object URL when the tile goes away (AC 3.26.3)", async () => {
    mockAdminApi.getImageReviewQueue.mockResolvedValue(queue([row("a")]));
    const { unmount } = renderQueue();
    await screen.findByRole("button", { name: "Enlarge question picture" });
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-url");
  });

  it("disables both actions while saving and labels the saving one (AC 3.26.3)", async () => {
    const user = userEvent.setup();
    mockAdminApi.getImageReviewQueue.mockResolvedValue(queue([row("a")]));
    mockAdminApi.setImageReviewBulk.mockReturnValue(new Promise(() => {}));
    renderQueue();
    await screen.findByText("1 picture submission waiting for review");

    await user.click(screen.getByRole("checkbox", { name: "Select picture for: Question a" }));
    await user.type(screen.getByLabelText(/Reason for rejection/), "Blurry");
    await user.click(screen.getByRole("button", { name: "Approve selected (1)" }));

    expect(await screen.findByRole("button", { name: "Approving..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject selected (1)" })).toBeDisabled();
  });

  it("keeps the selection and says so when the decisions cannot be saved (AC 3.26.4)", async () => {
    const user = userEvent.setup();
    mockAdminApi.getImageReviewQueue.mockResolvedValue(queue([row("a")]));
    mockAdminApi.setImageReviewBulk.mockRejectedValue(new Error("down"));
    renderQueue();
    await screen.findByText("1 picture submission waiting for review");

    await user.click(screen.getByRole("checkbox", { name: "Select picture for: Question a" }));
    await user.click(screen.getByRole("button", { name: "Approve selected (1)" }));

    expect(await screen.findByText("Could not save the decisions. Your selection is kept; try again.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select picture for: Question a" })).toBeChecked();
  });

  it("retries loading the queue from the error state (AC 3.26.3)", async () => {
    const user = userEvent.setup();
    mockAdminApi.getImageReviewQueue.mockRejectedValueOnce(new Error("down")).mockResolvedValue(queue([], 0));
    renderQueue();
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No pictures waiting for review")).toBeInTheDocument();
  });
});
