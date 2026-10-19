import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IdeaFormModal from "./IdeaFormModal";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

describe("TurnstileWidget inside IdeaFormModal", () => {
  let tokenCallback: ((token: string) => void) | undefined;
  const renderWidget = vi.fn();
  const removeWidget = vi.fn();

  beforeEach(() => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "test-site-key");
    renderWidget.mockImplementation((_container: HTMLElement, options: { callback?: (token: string) => void }) => {
      tokenCallback = options.callback;
      return "widget-1";
    });
    window.turnstile = { render: renderWidget, remove: removeWidget };
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    document.head.appendChild(script);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    renderWidget.mockReset();
    removeWidget.mockReset();
    tokenCallback = undefined;
    delete window.turnstile;
    document.head.querySelectorAll(`script[src="${SCRIPT_SRC}"]`).forEach((s) => s.remove());
  });

  it("renders the widget once while the form re-renders, and the token enables submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <IdeaFormModal
        isOpen
        requireTurnstile
        title="Share an idea"
        submitLabel="Submit idea"
        isPending={false}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(1));

    await user.type(screen.getByLabelText(/^title$/i), "Resume study");
    await user.type(screen.getByLabelText(/^problem$/i), "Learners lose their place often.");
    await user.type(screen.getByLabelText(/^proposed change$/i), "Add a resume action to the study page.");

    expect(renderWidget).toHaveBeenCalledTimes(1);
    expect(removeWidget).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /submit idea/i })).toBeDisabled();

    act(() => tokenCallback?.("real-token"));

    const submit = screen.getByRole("button", { name: /submit idea/i });
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ turnstileToken: "real-token" }));
  });
});
