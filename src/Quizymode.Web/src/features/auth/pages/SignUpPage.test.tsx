import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import SignUpPage from "./SignUpPage";

const mockSignup = vi.fn();
const mockSignInWithGoogle = vi.fn();
const mockConfirmSignup = vi.fn();
const mockResendConfirmationCode = vi.fn();
const mockNavigate = vi.fn();
const mockCheckAvailability = vi.fn();
let mockIsAuthenticated = false;
let mockAuthLoading = false;

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    signup: mockSignup,
    signInWithGoogle: mockSignInWithGoogle,
    confirmSignup: mockConfirmSignup,
    resendConfirmationCode: mockResendConfirmationCode,
    isAuthenticated: mockIsAuthenticated,
    isLoading: mockAuthLoading,
  }),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/api/users", () => ({
  usersApi: {
    checkAvailability: (req: unknown) => mockCheckAvailability(req),
  },
}));

vi.mock("@/features/legal/policyAcceptanceStorage", () => ({
  queueSignUpPolicyAcceptances: vi.fn(),
}));

function renderPage(initialEntry = "/signup") {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <SignUpPage />
      </MemoryRouter>
    </HelmetProvider>
  );
}

function fillSignUpForm(options: {
  username?: string;
  email?: string;
  password?: string;
  acceptLegal?: boolean;
} = {}) {
  const {
    username = "testuser",
    email = "test@example.com",
    password = "Password123",
    acceptLegal = true,
  } = options;

  fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: username } });
  fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: password } });

  if (acceptLegal) {
    fireEvent.click(screen.getByRole("checkbox"));
  }
}

describe("SignUpPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    mockIsAuthenticated = false;
    mockAuthLoading = false;
    mockCheckAvailability.mockResolvedValue({
      isUsernameAvailable: true,
      isEmailAvailable: true,
      usernameError: null,
      emailError: null,
    });
  });

  it("renders the default benefit-led heading and a single password field", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /make your next study session yours/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/confirm password/i)).not.toBeInTheDocument();
  });

  it.each([
    ["keep-collection", /bookmark this collection/i],
    ["create-content", /create private items/i],
    ["join-discussion", /join the discussion/i],
    ["save-progress", /quiz scores are not saved to accounts yet/i],
  ])("renders truthful copy for reason=%s", (reason, expectedText) => {
    renderPage(`/signup?reason=${reason}`);
    expect(screen.getByText(expectedText)).toBeInTheDocument();
  });

  it("falls back to default copy for an unknown or malicious reason value", () => {
    renderPage("/signup?reason=<script>alert(1)</script>");
    expect(screen.getByRole("heading", { name: /make your next study session yours/i })).toBeInTheDocument();
  });

  it("does not claim the result is saved, kept, synced or imported in save-progress copy", () => {
    renderPage("/signup?reason=save-progress");
    expect(screen.getByRole("heading", { name: "Make your next quiz yours" })).toBeInTheDocument();
    expect(screen.queryByText(/keep this result/i)).not.toBeInTheDocument();
    const bodyText = (screen.getByText(/quiz scores are not saved to accounts yet/i).textContent ?? "").toLowerCase();
    expect(bodyText).toContain("bookmark public collections");
    expect(bodyText).toContain("private practice sets");
    for (const claim of ["sync", "import", "stays saved", "in this browser", "keep", "restore"]) {
      expect(bodyText).not.toContain(claim);
    }
  });

  it("toggles password visibility", () => {
    renderPage();
    const passwordInput = screen.getByLabelText(/^password$/i);
    expect(passwordInput).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: /show password/i }));
    expect(passwordInput).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: /hide password/i }));
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("shows error when password is too short", async () => {
    renderPage();
    fillSignUpForm({ password: "short" });
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument();
    });
  });

  it("shows error when legal checkbox not checked", async () => {
    renderPage();
    fillSignUpForm({ acceptLegal: false });
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(screen.getByText(/you must agree to the terms of service/i)).toBeInTheDocument();
    });
  });

  it("shows error when display name equals email", async () => {
    renderPage();
    fillSignUpForm({ username: "same@example.com", email: "same@example.com" });
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(screen.getByText(/display name cannot be the same as email/i)).toBeInTheDocument();
    });
  });

  it("transitions to confirmation step and starts the resend cooldown after successful signup", async () => {
    mockSignup.mockResolvedValueOnce(undefined);
    renderPage();
    fillSignUpForm();
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /confirm your account/i })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /resend code \(\d+s\)/i })).toBeDisabled();
  });

  it("navigates to the validated destination when confirmation establishes a real session", async () => {
    mockSignup.mockResolvedValueOnce(undefined);
    mockConfirmSignup.mockResolvedValueOnce(true);
    renderPage("/signup?returnTo=%2Fitems%2Fadd");
    fillSignUpForm();
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => screen.getByLabelText(/confirmation code/i));
    fireEvent.change(screen.getByLabelText(/confirmation code/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(mockConfirmSignup).toHaveBeenCalledWith("test@example.com", "123456");
      expect(mockNavigate).toHaveBeenCalledWith("/items/add", { replace: true });
    });
  });

  it("shows 'sign in to continue' rather than navigating when no real session can be verified", async () => {
    mockSignup.mockResolvedValueOnce(undefined);
    mockConfirmSignup.mockResolvedValueOnce(false);
    renderPage();
    fillSignUpForm();
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => screen.getByLabelText(/confirmation code/i));
    fireEvent.change(screen.getByLabelText(/confirmation code/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /account confirmed/i })).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  it("shows a friendly message for a mismatched code without losing the email", async () => {
    mockSignup.mockResolvedValueOnce(undefined);
    const mismatchError = new Error("raw cognito message");
    mismatchError.name = "CodeMismatchException";
    mockConfirmSignup.mockRejectedValueOnce(mismatchError);
    renderPage();
    fillSignUpForm();
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => screen.getByLabelText(/confirmation code/i));
    fireEvent.change(screen.getByLabelText(/confirmation code/i), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(screen.getByText(/doesn't match/i)).toBeInTheDocument();
      expect(screen.getByText(/test@example\.com/)).toBeInTheDocument();
    });
  });

  it("resends the code once the cooldown has elapsed", async () => {
    // Restore straight into the confirmation step with an already-expired
    // cooldown (rather than fast-forwarding a real setInterval, which is
    // what actually drives the countdown) -- avoids fake-timer/real-timer
    // interval ordering issues entirely.
    window.sessionStorage.setItem(
      "quizymode.signup-recovery.v1",
      JSON.stringify({
        version: 1,
        email: "test@example.com",
        cooldownUntil: Date.now() - 1000,
        expiresAt: Date.now() + 1000,
      })
    );
    mockResendConfirmationCode.mockResolvedValueOnce(undefined);
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^resend code$/i })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole("button", { name: /^resend code$/i }));

    await waitFor(() => {
      expect(mockResendConfirmationCode).toHaveBeenCalledWith("test@example.com");
    });
  });

  it("disables resend while the cooldown is still active", async () => {
    mockSignup.mockResolvedValueOnce(undefined);
    renderPage();
    fillSignUpForm();
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => screen.getByLabelText(/confirmation code/i));

    expect(screen.getByRole("button", { name: /resend code \(\d+s\)/i })).toBeDisabled();
  });

  it("restarts the signup form when choosing a different email", async () => {
    mockSignup.mockResolvedValueOnce(undefined);
    renderPage();
    fillSignUpForm();
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => screen.getByRole("button", { name: /use a different email/i }));
    fireEvent.click(screen.getByRole("button", { name: /use a different email/i }));

    expect(screen.getByRole("heading", { name: /make your next study session yours/i })).toBeInTheDocument();
  });

  it("restores the confirmation step after a reload via tab-scoped recovery", () => {
    window.sessionStorage.setItem(
      "quizymode.signup-recovery.v1",
      JSON.stringify({ version: 1, email: "recovered@example.com", cooldownUntil: null, expiresAt: Date.now() + 1000 })
    );
    renderPage();
    expect(screen.getByRole("heading", { name: /confirm your account/i })).toBeInTheDocument();
    expect(screen.getByText(/recovered@example\.com/)).toBeInTheDocument();
  });

  it("carries returnTo/reason through to the sign-in link", () => {
    renderPage("/signup?returnTo=%2Fitems%2Fadd&reason=create-content");
    const link = screen.getByRole("link", { name: /sign in/i });
    expect(link.getAttribute("href")).toContain("returnTo=%2Fitems%2Fadd");
    expect(link.getAttribute("href")).toContain("reason=create-content");
  });

  it("redirects an already-authenticated visitor to the validated returnTo instead of rendering the form", () => {
    mockIsAuthenticated = true;
    mockAuthLoading = false;
    renderPage("/signup?returnTo=%2Fitems%2Fadd");
    // Prevents signing up for a second account while a different account's
    // session is still live in this tab -- the form must not render at all.
    expect(screen.queryByRole("heading", { name: /make your next study session yours/i })).not.toBeInTheDocument();
  });

  it("has links to terms and privacy pages", () => {
    renderPage();
    expect(screen.getByRole("link", { name: /terms of service/i })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: /privacy policy/i })).toHaveAttribute("href", "/privacy");
  });

  describe("error semantics (#156)", () => {
    it("announces a short-password error in an alert, marks the field invalid and focuses it", async () => {
      renderPage();
      fillSignUpForm({ password: "short" });
      fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(/at least 8 characters/i);
      const password = screen.getByLabelText(/^password$/i);
      expect(password).toHaveAttribute("aria-invalid", "true");
      expect(password.getAttribute("aria-describedby")).toContain(alert.id);
      expect(password.getAttribute("aria-describedby")).toContain("password-hint");
      expect(password).toHaveFocus();
    });

    it("links a taken display name or email to its own field only", async () => {
      mockCheckAvailability.mockResolvedValueOnce({
        isUsernameAvailable: true,
        isEmailAvailable: false,
        usernameError: null,
        emailError: "That email is already registered",
      });
      renderPage();
      fillSignUpForm();
      fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

      await screen.findByRole("alert");
      const email = screen.getByLabelText(/^email$/i);
      expect(email).toHaveAttribute("aria-invalid", "true");
      expect(email).toHaveFocus();
      expect(screen.getByLabelText(/display name/i)).not.toHaveAttribute("aria-invalid");
      expect(screen.getByLabelText(/^password$/i)).not.toHaveAttribute("aria-invalid");
    });

    it("links the unchecked legal acknowledgement error to the checkbox", async () => {
      renderPage();
      fillSignUpForm({ acceptLegal: false });
      fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

      await screen.findByRole("alert");
      expect(screen.getByRole("checkbox")).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByRole("checkbox")).toHaveFocus();
    });

    it("clears the invalid state when the form is resubmitted", async () => {
      renderPage();
      fillSignUpForm({ password: "short" });
      fireEvent.click(screen.getByRole("button", { name: /sign up/i }));
      await screen.findByRole("alert");

      mockSignup.mockResolvedValueOnce(undefined);
      fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "LongEnough1" } });
      fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

      await screen.findByLabelText(/confirmation code/i);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("announces a wrong confirmation code and focuses the code field", async () => {
      mockSignup.mockResolvedValueOnce(undefined);
      const mismatch = new Error("raw");
      mismatch.name = "CodeMismatchException";
      mockConfirmSignup.mockRejectedValueOnce(mismatch);
      renderPage();
      fillSignUpForm();
      fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

      fireEvent.change(await screen.findByLabelText(/confirmation code/i), { target: { value: "000000" } });
      fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(/doesn't match/i);
      const code = screen.getByLabelText(/confirmation code/i);
      expect(code).toHaveAttribute("aria-invalid", "true");
      expect(code.getAttribute("aria-describedby")).toBe(alert.id);
      expect(code).toHaveFocus();
    });

    it("lets a long email wrap on the confirmation step instead of forcing horizontal scroll", async () => {
      mockSignup.mockResolvedValueOnce(undefined);
      renderPage();
      const longEmail = `${"a".repeat(60)}@example.com`;
      fillSignUpForm({ email: longEmail });
      fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

      const line = await screen.findByText(/we sent a confirmation code to/i);
      expect(line.className).toContain("overflow-wrap:anywhere");
      expect(line).toHaveTextContent(longEmail);
    });

    it("gives every text input a visible focus ring, not just a border colour", () => {
      renderPage();
      for (const field of [screen.getByLabelText(/display name/i), screen.getByLabelText(/^email$/i), screen.getByLabelText(/^password$/i)]) {
        expect(field.className).toContain("focus:ring-2");
      }
    });
  });

  describe("Continue with Google", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    function enableGoogle() {
      vi.stubEnv("VITE_GOOGLE_SIGNIN_ENABLED", "true");
      vi.stubEnv("VITE_COGNITO_DOMAIN", "auth.quizymode.com");
    }

    it("is hidden when the flag is off", () => {
      renderPage();
      expect(screen.queryByRole("button", { name: /continue with google/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/By continuing with Google/)).not.toBeInTheDocument();
    });

    it("is shown with the terms helper when enabled, and is not gated by the legal checkbox", () => {
      enableGoogle();
      renderPage();
      const button = screen.getByRole("button", { name: "Continue with Google" });
      expect(button).toBeEnabled();
      expect(screen.getByRole("checkbox")).not.toBeChecked();
      expect(screen.getByText(/By continuing with Google you agree to the/)).toBeInTheDocument();
    });

    it("starts the redirect with the validated intent without requiring the checkbox", () => {
      enableGoogle();
      mockSignInWithGoogle.mockReturnValue(new Promise(() => undefined));
      renderPage("/signup?returnTo=%2Fcollections&reason=keep-collection");

      fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

      expect(mockSignInWithGoogle).toHaveBeenCalledWith({ returnTo: "/collections", reason: "keep-collection" });
    });

    it("explains a Google-only email without showing the Lambda sentinel, whether or not the flag is on", async () => {
      mockSignup.mockRejectedValue(new Error("PreSignUp failed with error QM_USE_GOOGLE."));
      renderPage();
      fillSignUpForm();

      fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("This email uses Continue with Google");
      expect(alert).not.toHaveTextContent("QM_USE_GOOGLE");
      expect(screen.getByLabelText(/^email$/i)).toHaveAttribute("aria-invalid", "true");
    });
  });
});
