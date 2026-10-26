import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ItemForm } from "./ItemForm";
import { taxonomyApi } from "@/api/taxonomy";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: true, userId: "user-1", isAdmin: false }),
}));

vi.mock("@/api/taxonomy", () => ({
  taxonomyApi: { getAll: vi.fn(), suggest: vi.fn() },
}));

const defaultValues = {
  category: "",
  isPrivate: true,
  navigationRank1: "",
  navigationRank2: "",
  readyForReview: false,
  question: "",
  questionSpeech: {},
  correctAnswer: "",
  correctAnswerSpeech: {},
  incorrectAnswers: ["", "", ""],
  incorrectAnswerSpeech: {},
  explanation: "",
  keywords: [] as { name: string; isPrivate: boolean }[],
  source: "",
};

function renderForm(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("ItemForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(taxonomyApi.getAll).mockResolvedValue({
      categories: ["Math", "Science"].map((slug) => ({
        slug,
        name: slug,
        description: null,
        itemCount: 0,
        allKeywordSlugs: [],
        groups: [],
      })),
    });
    vi.mocked(taxonomyApi.suggest).mockResolvedValue({ suggestions: [] });
  });

  it("renders create mode submit button label", () => {
    renderForm(
      <ItemForm
        mode="create"
        values={defaultValues}
        onChange={() => {}}
        onSubmit={() => {}}
        onCancel={() => {}}
        isAdmin={false}
        isPending={false}
      />
    );
    expect(screen.getByRole("button", { name: /save and study/i })).toBeInTheDocument();
  });

  it("renders edit mode submit button label", () => {
    renderForm(
      <ItemForm
        mode="edit"
        values={{ ...defaultValues, question: "Q?", correctAnswer: "A" }}
        onChange={() => {}}
        onSubmit={() => {}}
        onCancel={() => {}}
        isAdmin={false}
        isPending={false}
      />
    );
    expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument();
  });

  it("renders the topic group with a category select fed by the taxonomy, without a required attribute", async () => {
    renderForm(
      <ItemForm
        mode="create"
        values={defaultValues}
        onChange={() => {}}
        onSubmit={() => {}}
        onCancel={() => {}}
        isAdmin={false}
        isPending={false}
      />
    );
    expect(screen.getByRole("group", { name: /topic/i })).toBeInTheDocument();
    const select = await screen.findByLabelText(/category \*/i);
    expect(select).not.toBeRequired();
    expect(await screen.findByRole("option", { name: "Math" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Science" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Select a category" })).toBeInTheDocument();
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup({ delay: null });
    const onCancel = vi.fn();
    renderForm(
      <ItemForm
        mode="create"
        values={defaultValues}
        onChange={() => {}}
        onSubmit={() => {}}
        onCancel={onCancel}
        isAdmin={false}
        isPending={false}
      />
    );
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("shows validation error when provided", () => {
    renderForm(
      <ItemForm
        mode="create"
        values={defaultValues}
        onChange={() => {}}
        onSubmit={() => {}}
        onCancel={() => {}}
        isAdmin={false}
        isPending={false}
        validationError="Please provide at least one incorrect answer"
      />
    );
    expect(screen.getByText(/please provide at least one incorrect answer/i)).toBeInTheDocument();
  });

  it("shows the topic error from the page on the topic group", () => {
    renderForm(
      <ItemForm
        mode="create"
        values={defaultValues}
        onChange={() => {}}
        onSubmit={() => {}}
        onCancel={() => {}}
        isAdmin={false}
        isPending={false}
        topicError="Choose a topic: pick a suggestion, search, or browse all topics."
      />
    );
    expect(screen.getByRole("group", { name: /topic/i })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(/choose a topic/i);
  });

  it("disables submit when isPending", () => {
    renderForm(
      <ItemForm
        mode="create"
        values={defaultValues}
        onChange={() => {}}
        onSubmit={() => {}}
        onCancel={() => {}}
        isAdmin={false}
        isPending={true}
      />
    );
    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
  });

  it("asks for common topics once in create mode and never in edit mode", async () => {
    renderForm(
      <ItemForm
        mode="edit"
        values={defaultValues}
        onChange={() => {}}
        onSubmit={() => {}}
        onCancel={() => {}}
        isAdmin={false}
        isPending={false}
      />
    );
    await screen.findByRole("option", { name: "Math" });
    expect(taxonomyApi.suggest).not.toHaveBeenCalled();
  });

  it("requests the fallback chips on mount in create mode", async () => {
    renderForm(
      <ItemForm
        mode="create"
        values={defaultValues}
        onChange={() => {}}
        onSubmit={() => {}}
        onCancel={() => {}}
        isAdmin={false}
        isPending={false}
      />
    );
    await screen.findByRole("option", { name: "Math" });
    await vi.waitFor(() => expect(taxonomyApi.suggest).toHaveBeenCalledTimes(1));
    expect(vi.mocked(taxonomyApi.suggest).mock.calls[0][0]).toBe("");
  });

  function renderCreate(extra: Partial<React.ComponentProps<typeof ItemForm>> = {}) {
    return renderForm(
      <ItemForm
        mode="create"
        values={defaultValues}
        onChange={() => {}}
        onSubmit={() => {}}
        onCancel={() => {}}
        isAdmin={false}
        isPending={false}
        {...extra}
      />
    );
  }

  it("puts question and answers first, then More options, then Save to (#296)", async () => {
    renderCreate();
    await screen.findByRole("option", { name: "Math" });
    const question = screen.getByLabelText(/^question \*/i);
    const correct = screen.getByLabelText(/^correct answer \*/i);
    const incorrect = screen.getByPlaceholderText("Incorrect answer 1");
    const more = screen.getByRole("button", { name: /more options/i });
    const saveTo = screen.getByRole("heading", { name: "Save to" });
    const follows = (a: HTMLElement, b: HTMLElement) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(question, correct)).toBe(true);
    expect(follows(correct, incorrect)).toBe(true);
    expect(follows(incorrect, more)).toBe(true);
    expect(follows(more, saveTo)).toBe(true);
    expect(screen.getByRole("heading", { name: "Question and answers" })).toBeInTheDocument();
  });

  it("keeps More options collapsed by default and toggles it (#296)", async () => {
    const user = userEvent.setup({ delay: null });
    renderCreate();
    const toggle = screen.getByRole("button", { name: /more options/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const region = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
    expect(region).toHaveAttribute("hidden");
    expect(screen.queryByRole("textbox", { name: /explanation/i })).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(region).not.toHaveAttribute("hidden");
    expect(screen.getByRole("textbox", { name: /explanation/i })).toBeInTheDocument();
  });

  it("opens More options when the server error points at a field inside it (#296)", () => {
    renderCreate({ submitError: "Explanation must be at most 2000 characters." });
    expect(screen.getByRole("button", { name: /more options/i })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  it("opens More options in edit mode when a stored value exists, not otherwise (#296)", () => {
    const { unmount } = renderForm(
      <ItemForm
        mode="edit"
        values={{ ...defaultValues, explanation: "Because." }}
        onChange={() => {}}
        onSubmit={() => {}}
        onCancel={() => {}}
        isAdmin={false}
        isPending={false}
      />
    );
    expect(screen.getByRole("button", { name: /more options/i })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    unmount();
    renderForm(
      <ItemForm
        mode="edit"
        values={defaultValues}
        onChange={() => {}}
        onSubmit={() => {}}
        onCancel={() => {}}
        isAdmin={false}
        isPending={false}
      />
    );
    expect(screen.getByRole("button", { name: /more options/i })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  it("edit mode has a single Save button and no create actions (#296)", () => {
    renderForm(
      <ItemForm
        mode="edit"
        values={defaultValues}
        onChange={() => {}}
        onSubmit={() => {}}
        onCancel={() => {}}
        isAdmin={false}
        isPending={false}
      />
    );
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "submit");
    expect(screen.queryByRole("button", { name: /save and/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add another/i })).not.toBeInTheDocument();
  });

  it("create mode shows both save buttons, disabled while pending (#296)", () => {
    renderCreate({ isPending: true });
    expect(screen.getByRole("button", { name: /save and add another/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
  });
});
