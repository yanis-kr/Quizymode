import { describe, expect, it, vi } from "vitest";
import { createRef, type ComponentProps, type FormEvent, type RefObject } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TaxonomyResponse } from "@/api/taxonomy";
import TopicPathCombobox, { TOPIC_CAP_NOTE, TOPIC_HINT, TOPIC_LOAD_ERROR } from "./TopicPathCombobox";
import { buildTopicPaths, type TopicPath } from "./topicPaths";
import fixture from "./__fixtures__/taxonomy.fixture.json";

const taxonomy: TaxonomyResponse = {
  categories: [
    {
      slug: "exams",
      name: "exams",
      description: "Exam prep",
      itemCount: 0,
      allKeywordSlugs: [],
      groups: [
        {
          slug: "aws",
          description: "AWS certs",
          itemCount: 0,
          keywords: [
            { slug: "saa-c03", description: "Arch associate", itemCount: 0 },
            { slug: "saa-c04", description: "Arch associate next", itemCount: 0 },
          ],
        },
      ],
    },
    {
      slug: "tech",
      name: "tech",
      description: "Technology",
      itemCount: 0,
      allKeywordSlugs: [],
      groups: [
        {
          slug: "saa-tools",
          description: "Tools",
          itemCount: 0,
          keywords: [{ slug: "saa-cli", description: null, itemCount: 0 }],
        },
      ],
    },
  ],
};

const paths = buildTopicPaths(taxonomy);

function renderCombobox(overrides: Partial<ComponentProps<typeof TopicPathCombobox>> = {}) {
  const inputRef = createRef<HTMLInputElement>() as RefObject<HTMLInputElement | null>;
  const props = {
    idPrefix: "t",
    paths,
    isLoading: false,
    isError: false,
    inputRef,
    onPick: vi.fn<(path: TopicPath) => void>(),
    onOpenBrowse: vi.fn(),
    onAnnounce: vi.fn<(message: string) => void>(),
    ...overrides,
  };
  const view = render(
    <form onSubmit={(event) => event.preventDefault()}>
      <TopicPathCombobox {...props} />
    </form>
  );
  return { ...view, props, input: screen.getByRole("combobox", { name: /search topics/i }) };
}

describe("TopicPathCombobox", () => {
  it("is an ARIA combobox that only sets expanded, controls and activedescendant while the list shows", async () => {
    // AC 12.15
    const user = userEvent.setup({ delay: null });
    const { input } = renderCombobox();

    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).not.toHaveAttribute("aria-controls");
    expect(input).not.toHaveAttribute("aria-activedescendant");

    await user.type(input, "saa");
    expect(input).toHaveAttribute("aria-expanded", "true");
    const listbox = screen.getByRole("listbox", { name: "Topics" });
    expect(input).toHaveAttribute("aria-controls", listbox.id);
    // No option is active on open: nothing is chosen for the user.
    expect(input).not.toHaveAttribute("aria-activedescendant");
    expect(screen.getAllByRole("option").every((o) => o.getAttribute("aria-selected") === "false")).toBe(true);

    await user.keyboard("{ArrowDown}");
    const options = screen.getAllByRole("option");
    expect(input).toHaveAttribute("aria-activedescendant", options[0].id);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
  });

  it("groups options by category, skips the headings with the arrow keys and wraps", async () => {
    // AC 12.15
    const user = userEvent.setup({ delay: null });
    const { input } = renderCombobox();
    await user.type(input, "saa");

    expect(screen.getAllByRole("group")).toHaveLength(2);
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);

    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", options[2].id);
    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", options[0].id);
    await user.keyboard("{ArrowUp}");
    expect(input).toHaveAttribute("aria-activedescendant", options[2].id);
  });

  it("does nothing on Enter without an active option, and never submits the form", async () => {
    const user = userEvent.setup({ delay: null });
    const submit = vi.fn((event: FormEvent) => event.preventDefault());
    const inputRef = createRef<HTMLInputElement>() as RefObject<HTMLInputElement | null>;
    const onPick = vi.fn();
    render(
      <form onSubmit={submit}>
        <TopicPathCombobox
          idPrefix="t"
          paths={paths}
          isLoading={false}
          isError={false}
          inputRef={inputRef}
          onPick={onPick}
          onOpenBrowse={() => {}}
        />
        <button type="submit">Save</button>
      </form>
    );
    const input = screen.getByRole("combobox", { name: /search topics/i });
    await user.type(input, "saa");
    await user.keyboard("{Enter}");

    expect(onPick).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("picks the active option on Enter and clears the box", async () => {
    // AC 12.15
    const user = userEvent.setup({ delay: null });
    const { input, props } = renderCombobox();
    await user.type(input, "saa");
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(props.onPick).toHaveBeenCalledTimes(1);
    expect(vi.mocked(props.onPick).mock.calls[0][0]).toMatchObject({ category: "exams", l1: "aws", l2: "saa-c04" });
    expect(input).toHaveValue("");
  });

  it("picks an option with the pointer", async () => {
    const user = userEvent.setup({ delay: null });
    const { input, props } = renderCombobox();
    await user.type(input, "cli");
    await user.click(screen.getAllByRole("option")[0]);
    expect(props.onPick).toHaveBeenCalledWith(expect.objectContaining({ l2: "saa-cli" }));
  });

  it("closes on the first Escape, clears on the second, and closes on Tab without picking", async () => {
    const user = userEvent.setup({ delay: null });
    const { input, props } = renderCombobox();
    await user.type(input, "saa");
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveValue("saa");
    await user.keyboard("{Escape}");
    expect(input).toHaveValue("");

    await user.type(input, "saa");
    await user.keyboard("{ArrowDown}{Tab}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(props.onPick).not.toHaveBeenCalled();
  });

  it("opens with Alt+ArrowDown and shows the hint row under 2 characters", async () => {
    const user = userEvent.setup({ delay: null });
    const { input } = renderCombobox();
    await user.click(input);
    expect(screen.getByText(TOPIC_HINT)).toBeInTheDocument();
    expect(TOPIC_HINT).toContain("2 or more letters");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.type(input, "a");
    expect(screen.getByText(TOPIC_HINT)).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByText(TOPIC_HINT)).not.toBeInTheDocument();
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(screen.getByText(TOPIC_HINT)).toBeInTheDocument();
  });

  it("explains a miss and opens Browse from the no-match row", async () => {
    const user = userEvent.setup({ delay: null });
    const { input, props } = renderCombobox();
    await user.type(input, "qqqzz");

    expect(screen.getByText(/No topics match “qqqzz”/)).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "browse all topics" }));
    expect(props.onOpenBrowse).toHaveBeenCalledTimes(1);
  });

  it("shows the cap note when more than 50 topics match", async () => {
    const user = userEvent.setup({ delay: null });
    const { input } = renderCombobox({ paths: buildTopicPaths(fixture as TaxonomyResponse) });
    await user.type(input, "ai");

    expect(screen.getAllByRole("option")).toHaveLength(50);
    expect(screen.getByText(TOPIC_CAP_NOTE)).toBeInTheDocument();
  });

  it("announces the result count and the miss", async () => {
    const user = userEvent.setup({ delay: null });
    const { input, props } = renderCombobox();
    await user.type(input, "saa");
    expect(props.onAnnounce).toHaveBeenLastCalledWith("3 topics available. Use up and down arrow keys to navigate.");

    await user.clear(input);
    await user.type(input, "qqqzz");
    expect(props.onAnnounce).toHaveBeenLastCalledWith("No topics match qqqzz.");
  });

  it("is disabled with a loading placeholder while the taxonomy loads", () => {
    const { input } = renderCombobox({ isLoading: true });
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute("placeholder", "Loading topics…");
  });

  it("is disabled with an inline notice when the taxonomy failed to load", () => {
    const { input } = renderCombobox({ isError: true });
    expect(input).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(TOPIC_LOAD_ERROR);
  });

  it("renders matches as text, never as markup", () => {
    const hostile: TaxonomyResponse = {
      categories: [
        {
          slug: "tech",
          name: "tech",
          description: "<script>alert(1)</script>",
          itemCount: 0,
          allKeywordSlugs: [],
          groups: [
            {
              slug: "web",
              description: null,
              itemCount: 0,
              keywords: [{ slug: "xss", description: "<img src=x onerror=alert(1)>", itemCount: 0 }],
            },
          ],
        },
      ],
    };
    const { input, container } = renderCombobox({ paths: buildTopicPaths(hostile) });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "xss" } });

    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });
});
