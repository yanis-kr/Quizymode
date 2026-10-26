import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PasteTextImport from "./PasteTextImport";
import { CLOZE_AI_HELPER_PROMPT } from "@/features/items/utils/clozeParser";

function renderImport(maxItems = 100) {
  const onImport = vi.fn();
  const onPreviewChange = vi.fn();
  render(
    <PasteTextImport maxItems={maxItems} isPending={false} onImport={onImport} onPreviewChange={onPreviewChange} />
  );
  return { onImport, onPreviewChange };
}

function pasteText(value: string) {
  fireEvent.change(screen.getByLabelText(/pasted text/i), { target: { value } });
}

function chooseCloze() {
  fireEvent.click(screen.getByRole("radio", { name: "Cloze" }));
}

describe("PasteTextImport cloze format (#296)", () => {
  it("defaults to term pairs and hides separator controls in cloze mode", () => {
    renderImport();
    expect(screen.getByRole("group", { name: "Format" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /term pairs/i })).toBeChecked();
    expect(screen.getByLabelText(/separator/i)).toBeInTheDocument();

    chooseCloze();
    expect(screen.queryByLabelText(/separator/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/direction/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/question template/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/double quotes/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy ai helper prompt/i })).toBeInTheDocument();
  });

  it("previews the example line and keeps text when switching formats", () => {
    renderImport();
    pasteText("{{c1::Paris}} is the capital of France | Lyon | Marseille");
    chooseCloze();
    expect(screen.getByLabelText(/pasted text/i)).toHaveValue(
      "{{c1::Paris}} is the capital of France | Lyon | Marseille"
    );
    expect(screen.getByText("___ is the capital of France")).toBeInTheDocument();
    expect(screen.getByText("Paris")).toBeInTheDocument();
    expect(screen.getByText(/1 card ready/)).toBeInTheDocument();
  });

  it("lists lines without wrong answers as skipped with a reason", () => {
    renderImport();
    chooseCloze();
    pasteText("{{c1::Paris}} is the capital of France");
    expect(screen.getByText(/0 cards ready, 1 skipped/)).toBeInTheDocument();
    expect(screen.getByText(/Line 1 \(card c1\): needs 1-4 incorrect answers/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upload and open collection/i })).toBeDisabled();
  });

  it("notes that sibling cards reveal each other's answers", () => {
    renderImport();
    chooseCloze();
    pasteText("{{c1::France}}'s capital is {{c2::Paris}} | c1: Spain | c2: Rome");
    expect(screen.getByText(/2 cards ready/)).toBeInTheDocument();
    expect(screen.getByText(/reveal each other/i)).toBeInTheDocument();
  });

  it("imports cloze items with the term-pairs payload shape", () => {
    const { onImport } = renderImport();
    chooseCloze();
    pasteText("{{c1::Paris}} is the capital of France | Lyon | Marseille");
    fireEvent.click(screen.getByRole("button", { name: /upload and open collection/i }));
    const items = [
      {
        question: "___ is the capital of France",
        correctAnswer: "Paris",
        incorrectAnswers: ["Lyon", "Marseille"],
        explanation: "",
      },
    ];
    expect(onImport).toHaveBeenCalledWith(items, JSON.stringify(items));
  });

  it("copies the AI helper prompt and confirms", async () => {
    const user = userEvent.setup();
    renderImport();
    chooseCloze();
    await user.click(screen.getByRole("button", { name: /copy ai helper prompt/i }));
    expect(await navigator.clipboard.readText()).toBe(CLOZE_AI_HELPER_PROMPT);
    expect(screen.getByRole("status")).toHaveTextContent("Helper prompt copied to clipboard.");
  });

  it("warns when there are more cards than the limit", () => {
    renderImport(1);
    chooseCloze();
    pasteText("{{c1::A}} first | x\n{{c1::B}} second | y");
    expect(screen.getByText(/1 card ready/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("only the first 1 will be imported");
  });

  it("reports duplicates and more than 20 skipped lines", () => {
    renderImport();
    chooseCloze();
    pasteText("{{c1::A}} same | x\n{{c1::A}} same | y");
    expect(screen.getByText(/1 card ready, 1 duplicate removed/)).toBeInTheDocument();
    pasteText(Array.from({ length: 22 }, (_, i) => `no deletion ${i}`).join("\n"));
    expect(screen.getByText(/and 2 more/)).toBeInTheDocument();
  });

  it("sends cloze items to onPreviewChange", () => {
    const { onPreviewChange } = renderImport();
    chooseCloze();
    pasteText("{{c1::Paris}} is the capital of France | Lyon");
    expect(onPreviewChange).toHaveBeenLastCalledWith([
      {
        question: "___ is the capital of France",
        correctAnswer: "Paris",
        incorrectAnswers: ["Lyon"],
        explanation: "",
      },
    ]);
  });

  it("restores term-pairs controls and preview when switching back", () => {
    renderImport();
    pasteText("cat\tgato\ndog\tperro\nbird\tpajaro\nfish\tpez");
    expect(screen.getByText(/4 items ready/)).toBeInTheDocument();
    chooseCloze();
    expect(screen.queryByText(/4 items ready/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /term pairs/i }));
    expect(screen.getByLabelText(/separator/i)).toBeInTheDocument();
    expect(screen.getByText(/4 items ready/)).toBeInTheDocument();
  });
});
