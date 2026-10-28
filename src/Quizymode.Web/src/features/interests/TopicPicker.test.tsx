import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { interestsApi } from "@/api/learningLoop";
import { taxonomyApi } from "@/api/taxonomy";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import { renderWithProviders } from "@/features/learningLoop/learningLoopTestUtils";
import { homeCategoryCards } from "@/features/home/homePageData";
import { TopicEditorProvider } from "./TopicEditorProvider";
import { TopicPicker, TOPIC_RETURN_FOCUS_ATTRIBUTE } from "./TopicPicker";
import { useTopicEditor } from "./topicEditorContext";

const auth = vi.hoisted(() => ({ value: { isAuthenticated: true, isLoading: false, userId: "user-1" as string | null } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth.value }));
vi.mock("@/api/learningLoop", () => ({ interestsApi: { get: vi.fn(), replace: vi.fn() } }));
vi.mock("@/api/taxonomy", () => ({ taxonomyApi: { getAll: vi.fn() } }));

function Opener() {
  const { open } = useTopicEditor();
  return (
    <button type="button" onClick={open}>
      Change topics
    </button>
  );
}

const renderEditor = () =>
  renderWithProviders(
    <TopicEditorProvider>
      <Opener />
    </TopicEditorProvider>,
  );

describe("My topics editor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMemoryLocalStorage();
    auth.value = { isAuthenticated: true, isLoading: false, userId: "user-1" };
    vi.mocked(taxonomyApi.getAll).mockResolvedValue({ categories: [{ slug: "languages", name: "Languages", description: null, itemCount: 1, allKeywordSlugs: ["french", "core"], groups: [{ slug: "french", description: null, itemCount: 1, keywords: [{ slug: "core", description: null, itemCount: 1 }] }] }] });
  });

  it("#383: progressively refines a category and saves the complete path without its parent", async () => {
    vi.mocked(interestsApi.get).mockResolvedValue(["languages"]);
    vi.mocked(interestsApi.replace).mockResolvedValue(["languages/french/core"]);
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Change topics" }));
    await screen.findByRole("checkbox", { name: "Languages" });
    fireEvent.click(screen.getByText("Refine a topic"));
    fireEvent.change(await screen.findByLabelText("Category"), { target: { value: "languages" } });
    fireEvent.change(screen.getByLabelText("Topic (optional)"), { target: { value: "french" } });
    fireEvent.change(screen.getByLabelText("Subtopic (optional)"), { target: { value: "core" } });
    fireEvent.click(screen.getByRole("button", { name: "Add topic" }));
    expect(screen.getByRole("checkbox", { name: "Languages" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Remove Languages › French › Core" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save topics" }));
    await waitFor(() => expect(interestsApi.replace).toHaveBeenCalledWith(["languages/french/core"]));
  });

  it("#380: a failed topics load never lets Save replace the saved topics, and Retry prefills them", async () => {
    vi.mocked(interestsApi.get).mockRejectedValueOnce(new Error("down")).mockResolvedValue(["history"]);
    vi.mocked(interestsApi.replace).mockResolvedValue([]);

    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Change topics" }));
    const dialog = screen.getByRole("dialog", { name: "My topics" });

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Your topics could not be loaded.");
    expect(within(dialog).queryByRole("checkbox", { name: "History" })).not.toBeInTheDocument();
    const save = within(dialog).getByRole("button", { name: "Save topics" });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(interestsApi.replace).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Retry" }));
    expect(await within(dialog).findByRole("checkbox", { name: "History" })).toBeChecked();
    // Retry disappears with the error, so focus moves to the first chip instead of dropping to the page.
    expect(within(dialog).getAllByRole("checkbox")[0]).toHaveFocus();
    expect(within(dialog).getByRole("button", { name: "Save topics" })).toBeEnabled();
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    expect(interestsApi.replace).not.toHaveBeenCalled();
  });

  it("#380: opened while topics load, the picker waits, announces loading and then prefills them", async () => {
    let resolve: (value: string[]) => void = () => {};
    vi.mocked(interestsApi.get).mockReturnValue(new Promise<string[]>((r) => (resolve = r)));

    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Change topics" }));
    const dialog = screen.getByRole("dialog", { name: "My topics" });

    expect(within(dialog).getByRole("status")).toHaveTextContent("Loading your topics…");
    expect(within(dialog).getByRole("button", { name: "Save topics" })).toBeDisabled();
    // Loading: focus starts on Cancel, the only enabled control.
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();

    resolve(["history"]);
    expect(await within(dialog).findByRole("checkbox", { name: "History" })).toBeChecked();
    expect(within(dialog).getByRole("button", { name: "Save topics" })).toBeEnabled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a counter, saves the selection and closes", async () => {
    vi.mocked(interestsApi.get).mockResolvedValue(["history"]);
    vi.mocked(interestsApi.replace).mockResolvedValue(["history", "science"]);

    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Change topics" }));
    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByText("1 of 10")).toBeInTheDocument();
    expect(within(dialog).getByText("Pick up to 10. Your picks come first on Home.")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Science" }));
    expect(within(dialog).getByText("2 of 10")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save topics" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(interestsApi.replace).toHaveBeenCalledWith(["history", "science"]);
  });

  it("saves an empty selection", async () => {
    vi.mocked(interestsApi.get).mockResolvedValue(["history"]);
    vi.mocked(interestsApi.replace).mockResolvedValue([]);

    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Change topics" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "History" }));
    fireEvent.click(screen.getByRole("button", { name: "Save topics" }));

    await waitFor(() => expect(interestsApi.replace).toHaveBeenCalledWith([]));
  });

  it("disables the remaining chips at 10 and explains why", async () => {
    expect(homeCategoryCards.length).toBeGreaterThan(10);
    vi.mocked(interestsApi.get).mockResolvedValue(homeCategoryCards.slice(0, 10).map((card) => card.slug));

    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Change topics" }));
    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByText("10 of 10")).toBeInTheDocument();
    expect(within(dialog).getByText(/the most you can pick/)).toBeInTheDocument();
    const unchecked = within(dialog).getAllByRole("checkbox", { checked: false });
    expect(unchecked.length).toBeGreaterThan(0);
    unchecked.forEach((box) => expect(box).toBeDisabled());

    // Removing one re-enables the rest.
    fireEvent.click(within(dialog).getAllByRole("checkbox", { checked: true })[0]);
    expect(within(dialog).queryByText(/the most you can pick/)).not.toBeInTheDocument();
    within(dialog).getAllByRole("checkbox", { checked: false }).forEach((box) => expect(box).toBeEnabled());
  });

  it("keeps the dialog open with an error when saving fails, and Escape closes it", async () => {
    vi.mocked(interestsApi.get).mockResolvedValue([]);
    vi.mocked(interestsApi.replace).mockRejectedValue(new Error("down"));

    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Change topics" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save topics" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Save topics" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Your topics could not be saved. Try again.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("returns focus to the opener on Escape", async () => {
    vi.mocked(interestsApi.get).mockResolvedValue([]);
    renderEditor();
    const opener = screen.getByRole("button", { name: "Change topics" });
    opener.focus();
    fireEvent.click(opener);
    await screen.findByRole("checkbox", { name: "Exams" });

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("falls back to the nav trigger, never the page body, when the opener is gone", () => {
    const trigger = document.createElement("button");
    trigger.setAttribute(TOPIC_RETURN_FOCUS_ATTRIBUTE, "");
    document.body.appendChild(trigger);

    const { unmount } = renderWithProviders(
      <TopicPicker
        initial={[]}
        status="ready"
        saving={false}
        error={false}
        onSave={() => {}}
        retrying={false}
        onRetry={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it("traps Tab in both directions", async () => {
    vi.mocked(interestsApi.get).mockResolvedValue([]);
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Change topics" }));
    const dialog = screen.getByRole("dialog");
    await within(dialog).findByRole("checkbox", { name: "Exams" });
    const boxes = within(dialog).getAllByRole("checkbox");
    const save = within(dialog).getByRole("button", { name: "Save topics" });

    expect(boxes[0]).toHaveFocus();
    // Shift+Tab from the first control wraps to the last (Save).
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(save).toHaveFocus();
    // Tab from the last control wraps to the first chip.
    fireEvent.keyDown(window, { key: "Tab" });
    expect(boxes[0]).toHaveFocus();
    // Focus that escaped the dialog is pulled back in.
    save.blur();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(boxes[0]).toHaveFocus();
  });

  it("keeps the trap working after loading is replaced by chips", async () => {
    let resolve: (value: string[]) => void = () => {};
    vi.mocked(interestsApi.get).mockReturnValue(new Promise<string[]>((r) => (resolve = r)));
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Change topics" }));
    const dialog = screen.getByRole("dialog");

    // While loading, Cancel is the only focusable control (Save is disabled).
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();

    resolve([]);
    await within(dialog).findByRole("checkbox", { name: "Exams" });
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(within(dialog).getByRole("button", { name: "Save topics" })).toHaveFocus();
  });

  it("starts focus on the first enabled chip when the first category is disabled at 10", async () => {
    const saved = homeCategoryCards.slice(1, 11).map((card) => card.slug);
    vi.mocked(interestsApi.get).mockResolvedValue(saved);

    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Change topics" }));
    const dialog = screen.getByRole("dialog");
    await within(dialog).findByText("10 of 10");

    const first = within(dialog).getAllByRole("checkbox")[0];
    expect(first).toBeDisabled();
    expect(within(dialog).getAllByRole("checkbox").find((box) => !(box as HTMLInputElement).disabled)).toHaveFocus();
  });
});
