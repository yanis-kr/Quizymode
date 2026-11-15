import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import ResetPasswordPage from "./ResetPasswordPage";
import {
  GOOGLE_ONLY_HINT,
  PASSWORD_RESET_ERROR_COPY,
  REQUEST_SENT_MESSAGE,
} from "@/features/auth/utils/passwordResetErrors";

const mockResetPassword = vi.fn();
const mockConfirmResetPassword = vi.fn();
const mockLogin = vi.fn();
const mockNavigate = vi.fn();

vi.mock("aws-amplify/auth", () => ({
  resetPassword: (...args: unknown[]) => mockResetPassword(...args),
  confirmResetPassword: (...args: unknown[]) => mockConfirmResetPassword(...args),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ login: mockLogin, isAuthenticated: false, isLoading: false }),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderPage(entry = "/reset-password") {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[entry]}>
        <ResetPasswordPage />
      </MemoryRouter>
    </HelmetProvider>
  );
}

function named(name: string): Error {
  const e = new Error("raw cognito message that must never be shown");
  e.name = name;
  return e;
}

async function requestCode(email = "a@b.co") {
  fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Send code" }));
  await screen.findByPlaceholderText("Verification code");
}

async function submitConfirm(code = "123456", password = "Newpass1!") {
  fireEvent.change(screen.getByPlaceholderText("Verification code"), { target: { value: code } });
  fireEvent.change(screen.getByPlaceholderText("New password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
}

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResetPassword.mockResolvedValue({});
    mockConfirmResetPassword.mockResolvedValue(undefined);
    mockLogin.mockResolvedValue(undefined);
  });

  it("request step shows the email form and the static Google-only hint (AC 4.6.16)", () => {
    renderPage();
    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    expect(screen.getByText(GOOGLE_ONLY_HINT)).toBeInTheDocument();
  });

  it.each([
    ["success", () => mockResetPassword.mockResolvedValue({})],
    ["unknown account", () => mockResetPassword.mockRejectedValue(named("UserNotFoundException"))],
    ["unsupported account", () => mockResetPassword.mockRejectedValue(named("InvalidParameterException"))],
    ["rate limit", () => mockResetPassword.mockRejectedValue(named("LimitExceededException"))],
  ])("request step shows the same enumeration-safe message on %s (AC 4.6.14)", async (_label, arrange) => {
    arrange();
    renderPage();
    await requestCode();
    expect(mockResetPassword).toHaveBeenCalledWith({ username: "a@b.co" });
    expect(screen.getByRole("status")).toHaveTextContent(REQUEST_SENT_MESSAGE);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("confirm step signs in and navigates to the same-origin returnTo (AC 4.6.15)", async () => {
    renderPage("/reset-password?returnTo=%2Fquiz%2Fflags");
    await requestCode();
    await submitConfirm();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/quiz/flags", { replace: true }));
    expect(mockConfirmResetPassword).toHaveBeenCalledWith({
      username: "a@b.co",
      confirmationCode: "123456",
      newPassword: "Newpass1!",
    });
    expect(mockLogin).toHaveBeenCalledWith("a@b.co", "Newpass1!");
  });

  it("confirm step ignores an external returnTo and lands on / (AC 4.6.15)", async () => {
    renderPage("/reset-password?returnTo=https%3A%2F%2Fevil.example%2Fx");
    await requestCode();
    await submitConfirm();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true }));
  });

  it("falls back to the login page when auto sign-in fails after a successful reset", async () => {
    mockLogin.mockRejectedValue(new Error("boom"));
    renderPage("/reset-password?returnTo=%2Fquiz%2Fflags");
    await requestCode();
    await submitConfirm();
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/login?returnTo=%2Fquiz%2Fflags", { replace: true })
    );
  });

  it.each([
    ["CodeMismatchException", "invalid-code"],
    ["ExpiredCodeException", "invalid-code"],
    ["LimitExceededException", "too-many-attempts"],
    ["TooManyFailedAttemptsException", "too-many-attempts"],
    ["InvalidPasswordException", "weak-password"],
    ["SomethingElseException", "generic"],
  ] as const)("confirm step maps %s to fixed copy, never the raw message (AC 4.6.17)", async (name, code) => {
    mockConfirmResetPassword.mockRejectedValue(named(name));
    renderPage();
    await requestCode();
    await submitConfirm();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(PASSWORD_RESET_ERROR_COPY[code]);
    expect(alert).not.toHaveTextContent("raw cognito message");
    expect(mockLogin).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
