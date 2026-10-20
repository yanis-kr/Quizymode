import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { GoogleSignInSection } from "./GoogleSignInSection";

const mockSignInWithGoogle = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ signInWithGoogle: mockSignInWithGoogle }),
}));

const INTENT = { returnTo: "/collections", reason: "keep-collection" as const };
const IN_APP_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/21A329 Instagram 300.0.0.0";

function renderSection(props: Partial<React.ComponentProps<typeof GoogleSignInSection>> = {}) {
  const onError = vi.fn();
  const onStartingChange = vi.fn();
  render(
    <MemoryRouter>
      <GoogleSignInSection intent={INTENT} onError={onError} onStartingChange={onStartingChange} {...props} />
    </MemoryRouter>
  );
  return { onError, onStartingChange };
}

describe("GoogleSignInSection", () => {
  beforeEach(() => {
    mockSignInWithGoogle.mockReset();
    vi.stubEnv("VITE_GOOGLE_SIGNIN_ENABLED", "true");
    vi.stubEnv("VITE_COGNITO_DOMAIN", "auth.quizymode.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders neither the button nor the divider when the flag is off", () => {
    vi.stubEnv("VITE_GOOGLE_SIGNIN_ENABLED", "");
    const { container } = render(
      <MemoryRouter>
        <GoogleSignInSection intent={INTENT} onError={vi.fn()} />
      </MemoryRouter>
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders the divider and Continue with Google when enabled", () => {
    renderSection();

    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
    expect(screen.getByText("or")).toBeInTheDocument();
  });

  it("starts the redirect with the intent, then shows a disabled loading state", async () => {
    mockSignInWithGoogle.mockReturnValue(new Promise(() => undefined));
    const { onStartingChange } = renderSection();

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(mockSignInWithGoogle).toHaveBeenCalledWith(INTENT);
    const busy = await screen.findByRole("button", { name: /Redirecting to Google/ });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(onStartingChange).toHaveBeenCalledWith(true);
  });

  it("resets, reports the fixed error and refocuses the button when the redirect cannot start", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockSignInWithGoogle.mockRejectedValue(new Error("network down: secret detail"));
    const { onError } = renderSection();

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() =>
      expect(onError).toHaveBeenLastCalledWith(
        "We couldn't start Google sign-in. Please try again, or use your email and password."
      )
    );
    const button = screen.getByRole("button", { name: "Continue with Google" });
    expect(button).toBeEnabled();
    expect(button).toHaveFocus();
  });

  it("is not gated by anything else on the page and can be disabled by the page", () => {
    renderSection({ disabled: true });
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeDisabled();
  });

  it("resets the redirecting state when the page is restored from the back-forward cache", async () => {
    mockSignInWithGoogle.mockReturnValue(new Promise(() => undefined));
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await screen.findByRole("button", { name: /Redirecting to Google/ });

    const event = new Event("pageshow") as PageTransitionEvent;
    Object.defineProperty(event, "persisted", { value: true });
    window.dispatchEvent(event);

    expect(await screen.findByRole("button", { name: "Continue with Google" })).toBeEnabled();
  });

  it("shows the terms helper only when asked", () => {
    renderSection({ showLegalHelper: true });
    expect(screen.getByText(/By continuing with Google you agree to the/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  });

  describe("in an in-app browser", () => {
    beforeEach(() => {
      vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(IN_APP_UA);
    });

    it("replaces the button with a notice and a copy-link action", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal("navigator", { userAgent: IN_APP_UA, clipboard: { writeText } });
      renderSection();

      expect(screen.queryByRole("button", { name: "Continue with Google" })).not.toBeInTheDocument();
      expect(screen.getByText("Open this page in your browser to continue with Google.")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

      await waitFor(() => expect(writeText).toHaveBeenCalledWith(window.location.href));
      expect((await screen.findAllByText("Link copied")).length).toBeGreaterThan(0);
    });

    it("shows the failure line when the clipboard is unavailable", async () => {
      vi.stubGlobal("navigator", { userAgent: IN_APP_UA });
      renderSection();

      fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Couldn't copy the link. Select the address in your browser's address bar instead."
      );
    });
  });
});
