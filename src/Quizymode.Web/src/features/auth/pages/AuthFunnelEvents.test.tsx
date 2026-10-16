import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import SignUpPage from "./SignUpPage";
import LoginPage from "./LoginPage";

const mockTrackEventOnce = vi.fn();
const mockSignup = vi.fn();
const mockConfirmSignup = vi.fn();
const mockLogin = vi.fn();
const mockNavigate = vi.fn();

vi.mock("@/features/analytics/analyticsEvents", () => ({
  trackEventOnce: (key: string, input: unknown) => mockTrackEventOnce(key, input),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    signup: mockSignup,
    confirmSignup: mockConfirmSignup,
    resendConfirmationCode: vi.fn(),
    login: mockLogin,
    isAuthenticated: false,
    isLoading: false,
  }),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/api/users", () => ({
  usersApi: {
    checkAvailability: () =>
      Promise.resolve({
        isUsernameAvailable: true,
        isEmailAvailable: true,
        usernameError: null,
        emailError: null,
      }),
  },
}));

vi.mock("@/features/legal/policyAcceptanceStorage", () => ({
  queueSignUpPolicyAcceptances: vi.fn(),
}));

function renderRoute(page: "signup" | "login", search = "") {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/${page}${search}`]}>
        {page === "signup" ? <SignUpPage /> : <LoginPage />}
      </MemoryRouter>
    </HelmetProvider>
  );
}

function eventNames(): string[] {
  return mockTrackEventOnce.mock.calls.map(([, input]) => (input as { name: string }).name);
}

function fillAndSubmitSignUp() {
  fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "testuser" } });
  fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "secret.person@example.com" } });
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "Sup3rSecretPw" } });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.submit(screen.getByRole("button", { name: /sign up|create account/i }).closest("form")!);
}

describe("signup and sign-in funnel events (AC 5.4.9a)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it("emits signup_form_started when the form is first focused, with the allowlisted reason only", () => {
    renderRoute("signup", "?reason=keep-collection&returnTo=%2Fcollections%2Fabc");
    fireEvent.focus(screen.getByLabelText(/display name/i));

    expect(mockTrackEventOnce).toHaveBeenCalledWith("form-started", {
      name: "signup_form_started",
      contextType: "auth",
      contextId: "keep-collection",
    });
  });

  it("sends no context id when the reason is absent or unknown", () => {
    renderRoute("signup", "?reason=%3Cscript%3E");
    fireEvent.focus(screen.getByLabelText(/display name/i));

    expect(mockTrackEventOnce).toHaveBeenCalledWith("form-started", {
      name: "signup_form_started",
      contextType: "auth",
    });
  });

  it("emits submitted then confirmation_shown, then confirmed and sign_in_completed once a session exists", async () => {
    mockSignup.mockResolvedValueOnce(undefined);
    mockConfirmSignup.mockResolvedValueOnce(true);
    renderRoute("signup");

    fillAndSubmitSignUp();
    await screen.findByRole("heading", { name: /confirm your account/i });
    expect(eventNames()).toEqual(["signup_submitted", "signup_confirmation_shown"]);

    fireEvent.change(screen.getByLabelText(/confirmation code/i), { target: { value: "123456" } });
    fireEvent.submit(screen.getByLabelText(/confirmation code/i).closest("form")!);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());

    expect(eventNames()).toEqual([
      "signup_submitted",
      "signup_confirmation_shown",
      "signup_confirmed",
      "sign_in_completed",
    ]);
  });

  it("emits signup_confirmed but not sign_in_completed when confirmation cannot establish a session", async () => {
    mockSignup.mockResolvedValueOnce(undefined);
    mockConfirmSignup.mockResolvedValueOnce(false);
    renderRoute("signup");

    fillAndSubmitSignUp();
    await screen.findByRole("heading", { name: /confirm your account/i });
    fireEvent.change(screen.getByLabelText(/confirmation code/i), { target: { value: "123456" } });
    fireEvent.submit(screen.getByLabelText(/confirmation code/i).closest("form")!);
    await screen.findByText(/account confirmed/i);

    expect(eventNames()).toContain("signup_confirmed");
    expect(eventNames()).not.toContain("sign_in_completed");
  });

  it("does not emit confirmation_shown or confirmed when the signup itself fails", async () => {
    mockSignup.mockRejectedValueOnce(new Error("UsernameExistsException"));
    renderRoute("signup");

    fillAndSubmitSignUp();
    await screen.findByText(/UsernameExistsException/);

    expect(eventNames()).toEqual(["signup_submitted"]);
  });

  it("never sends the email, display name, password or code in any event", async () => {
    mockSignup.mockResolvedValueOnce(undefined);
    mockConfirmSignup.mockResolvedValueOnce(true);
    renderRoute("signup", "?reason=save-progress");

    fillAndSubmitSignUp();
    await screen.findByRole("heading", { name: /confirm your account/i });
    fireEvent.change(screen.getByLabelText(/confirmation code/i), { target: { value: "654321" } });
    fireEvent.submit(screen.getByLabelText(/confirmation code/i).closest("form")!);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());

    const serialized = JSON.stringify(mockTrackEventOnce.mock.calls);
    for (const secret of ["secret.person", "testuser", "Sup3rSecretPw", "654321"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("emits sign_in_completed after a successful login and nothing when login fails", async () => {
    mockLogin.mockRejectedValueOnce(new Error("Incorrect username or password."));
    renderRoute("login", "?reason=join-discussion");
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: "u@example.com" } });
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: "wrong-pass" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await screen.findByText(/incorrect username or password/i);
    expect(eventNames()).toEqual([]);

    mockLogin.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());

    expect(mockTrackEventOnce).toHaveBeenCalledWith("completed", {
      name: "sign_in_completed",
      contextType: "auth",
      contextId: "join-discussion",
    });
  });
});
