import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItemForm } from "./ItemForm";

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

describe("ItemForm", () => {
  it("renders create mode submit button label", () => {
    render(
      <ItemForm
        mode="create"
        values={defaultValues}
        onChange={() => {}}
        onSubmit={() => {}}
        onCancel={() => {}}
        categories={[{ category: "Math" }]}
        isAdmin={false}
        isPending={false}
      />
    );
    expect(screen.getByRole("button", { name: /create item/i })).toBeInTheDocument();
  });

  it("renders edit mode submit button label", () => {
    render(
      <ItemForm
        mode="edit"
        values={{ ...defaultValues, question: "Q?", correctAnswer: "A" }}
        onChange={() => {}}
        onSubmit={() => {}}
        onCancel={() => {}}
        categories={[{ category: "Math" }]}
        isAdmin={false}
        isPending={false}
      />
    );
    expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
  });

  it("renders category select with options", () => {
    render(
      <ItemForm
        mode="create"
        values={defaultValues}
        onChange={() => {}}
        onSubmit={() => {}}
        onCancel={() => {}}
        categories={[{ category: "Math" }, { category: "Science" }]}
        isAdmin={false}
        isPending={false}
      />
    );
    expect(screen.getByLabelText(/category \*/i)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Select a category" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Math" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Science" })).toBeInTheDocument();
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup({ delay: null });
    const onCancel = vi.fn();
    render(
      <ItemForm
        mode="create"
        values={defaultValues}
        onChange={() => {}}
        onSubmit={() => {}}
        onCancel={onCancel}
        categories={[]}
        isAdmin={false}
        isPending={false}
      />
    );
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("shows validation error when provided", () => {
    render(
      <ItemForm
        mode="create"
        values={defaultValues}
        onChange={() => {}}
        onSubmit={() => {}}
        onCancel={() => {}}
        categories={[]}
        isAdmin={false}
        isPending={false}
        validationError="Please provide at least one incorrect answer"
      />
    );
    expect(screen.getByText(/please provide at least one incorrect answer/i)).toBeInTheDocument();
  });

  it("disables submit when isPending", () => {
    render(
      <ItemForm
        mode="create"
        values={defaultValues}
        onChange={() => {}}
        onSubmit={() => {}}
        onCancel={() => {}}
        categories={[]}
        isAdmin={false}
        isPending={true}
      />
    );
    expect(screen.getByRole("button", { name: /creating/i })).toBeDisabled();
  });
});
