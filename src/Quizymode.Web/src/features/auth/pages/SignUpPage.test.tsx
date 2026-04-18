import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import SignUpPage from "./SignUpPage";

const mockSignup = vi.fn();
const mockConfirmSignup = vi.fn();
const mockNavigate = vi.fn();
const mockCheckAvailability = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    signup: mockSignup,
    confirmSignup: mockConfirmSignup,
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

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <SignUpPage />
      </MemoryRouter>
    </HelmetProvider>
  );
}

function fillSignUpForm(options: {
  username?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  acceptLegal?: boolean;
} = {}) {
  const {
    username = "testuser",
    email = "test@example.com",
    password = "Password123",
    confirmPassword = "Password123",
    acceptLegal = true,
  } = options;

  fireEvent.change(screen.getByPlaceholderText(/username/i), { target: { value: username } });
  fireEvent.change(screen.getByPlaceholderText(/^email$/i), { target: { value: email } });
  fireEvent.change(screen.getByPlaceholderText(/^password \(min/i), { target: { value: password } });
  fireEvent.change(screen.getByPlaceholderText(/confirm password/i), { target: { value: confirmPassword } });

  if (acceptLegal) {
    fireEvent.click(screen.getByRole("checkbox"));
  }
}

describe("SignUpPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckAvailability.mockResolvedValue({
      isUsernameAvailable: true,
      isEmailAvailable: true,
      usernameError: null,
      emailError: null,
    });
  });

  it("renders sign-up form", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /create your account/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/username/i)).toBeInTheDocument();
  });

  it("shows error when passwords do not match", async () => {
    renderPage();
    fillSignUpForm({ confirmPassword: "DifferentPass" });
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
  });

  it("shows error when password is too short", async () => {
    renderPage();
    fillSignUpForm({ password: "short", confirmPassword: "short" });
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
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

  it("shows error when username equals email", async () => {
    renderPage();
    fillSignUpForm({ username: "same@example.com", email: "same@example.com" });
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(screen.getByText(/username cannot be the same as email/i)).toBeInTheDocument();
    });
  });

  it("shows error when username is already taken", async () => {
    mockCheckAvailability.mockResolvedValueOnce({
      isUsernameAvailable: false,
      usernameError: "Username is already registered",
      isEmailAvailable: true,
      emailError: null,
    });
    renderPage();
    fillSignUpForm();
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(screen.getByText(/username is already registered/i)).toBeInTheDocument();
    });
  });

  it("transitions to confirmation step after successful signup", async () => {
    mockSignup.mockResolvedValueOnce(undefined);
    renderPage();
    fillSignUpForm();
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /confirm your account/i })).toBeInTheDocument();
    });
  });

  it("calls confirmSignup and navigates to login after confirming", async () => {
    mockSignup.mockResolvedValueOnce(undefined);
    mockConfirmSignup.mockResolvedValueOnce(undefined);
    renderPage();
    fillSignUpForm();
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/confirmation code/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText(/confirmation code/i), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(mockConfirmSignup).toHaveBeenCalledWith("test@example.com", "123456");
      expect(mockNavigate).toHaveBeenCalledWith("/login");
    });
  });

  it("shows error on confirmation failure", async () => {
    mockSignup.mockResolvedValueOnce(undefined);
    mockConfirmSignup.mockRejectedValueOnce(new Error("Invalid code"));
    renderPage();
    fillSignUpForm();
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => screen.getByPlaceholderText(/confirmation code/i));

    fireEvent.change(screen.getByPlaceholderText(/confirmation code/i), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid code/i)).toBeInTheDocument();
    });
  });

  it("has links to login, terms, and privacy pages", () => {
    renderPage();
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: /terms of service/i })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: /privacy policy/i })).toHaveAttribute("href", "/privacy");
  });
});
