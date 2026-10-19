import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IdeaFormModal from "./IdeaFormModal";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

describe("TurnstileWidget inside IdeaFormModal", () => {
  let tokenCallback: ((token: string) => void) | undefined;
  let errorCallback: (() => void) | undefined;
  const renderWidget = vi.fn();
  const resetWidget = vi.fn();
  const removeWidget = vi.fn();

  beforeEach(() => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "test-site-key");
    renderWidget.mockImplementation(
      (_container: HTMLElement, options: { callback?: (token: string) => void; "error-callback"?: () => void }) => {
        tokenCallback = options.callback;
        errorCallback = options["error-callback"];
        return "widget-1";
      }
    );
    window.turnstile = { render: renderWidget, reset: resetWidget, remove: removeWidget };
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    document.head.appendChild(script);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    renderWidget.mockReset();
    resetWidget.mockReset();
    removeWidget.mockReset();
    tokenCallback = undefined;
    errorCallback = undefined;
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

  it("offers Try again after a failed check, keeps the typed idea, and clears the error on success", async () => {
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

    act(() => errorCallback?.());
    expect(screen.getByRole("alert")).toHaveTextContent(/verification failed/i);

    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(resetWidget).toHaveBeenCalledWith("widget-1");
    expect(renderWidget).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^title$/i)).toHaveValue("Resume study");

    act(() => errorCallback?.());
    act(() => tokenCallback?.("second-token"));
    expect(screen.queryByText(/verification failed/i)).not.toBeInTheDocument();
  });
});
