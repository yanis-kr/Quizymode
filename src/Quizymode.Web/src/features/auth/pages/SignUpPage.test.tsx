import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import SignUpPage from "./SignUpPage";

const mockSignup = vi.fn();
const mockConfirmSignup = vi.fn();
const mockResendConfirmationCode = vi.fn();
const mockNavigate = vi.fn();
const mockCheckAvailability = vi.fn();
let mockIsAuthenticated = false;
let mockAuthLoading = false;

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    signup: mockSignup,
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
    ["save-progress", /stays saved in this browser/i],
  ])("renders truthful copy for reason=%s", (reason, expectedText) => {
    renderPage(`/signup?reason=${reason}`);
    expect(screen.getByText(expectedText)).toBeInTheDocument();
  });

  it("falls back to default copy for an unknown or malicious reason value", () => {
    renderPage("/signup?reason=<script>alert(1)</script>");
    expect(screen.getByRole("heading", { name: /make your next study session yours/i })).toBeInTheDocument();
  });

  it("does not promise score sync or import in save-progress copy", () => {
    renderPage("/signup?reason=save-progress");
    const bodyText = screen.getByText(/stays saved in this browser/i).textContent ?? "";
    expect(bodyText.toLowerCase()).not.toContain("sync");
    expect(bodyText.toLowerCase()).not.toContain("import");
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
});
