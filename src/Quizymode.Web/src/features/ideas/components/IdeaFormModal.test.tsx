import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IdeaFormModal from "./IdeaFormModal";

vi.mock("./TurnstileWidget", () => ({
  default: () => null,
}));

describe("IdeaFormModal meaningful-character validation", () => {
  it("flags a punctuation-only title inline and does not submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <IdeaFormModal
        isOpen
        title="Share an idea"
        submitLabel="Submit idea"
        isPending={false}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    await user.type(screen.getByLabelText(/^title$/i), "---");
    await user.type(screen.getByLabelText(/^problem$/i), "Learners lose their place often.");
    await user.type(
      screen.getByLabelText(/^proposed change$/i),
      "Add a resume action to the study page."
    );
    await user.click(screen.getByRole("button", { name: /submit idea/i }));

    expect(
      screen.getByText("Title must contain at least 3 letters or digits.")
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(/^title$/i));
    await user.type(screen.getByLabelText(/^title$/i), "Resume study");
    await user.click(screen.getByRole("button", { name: /submit idea/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
