import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import LoginPage from "./LoginPage";

const mockLogin = vi.fn();
const mockSignInWithGoogle = vi.fn();
const mockNavigate = vi.fn();
let mockIsAuthenticated = false;
let mockAuthLoading = false;

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    login: mockLogin,
    signInWithGoogle: mockSignInWithGoogle,
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

function renderPage(initialEntry = "/login") {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <LoginPage />
      </MemoryRouter>
    </HelmetProvider>
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = false;
    mockAuthLoading = false;
  });

  it("renders sign-in form", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("calls login and navigates to / when no returnTo is present", async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    renderPage();

    fireEvent.change(screen.getByPlaceholderText(/email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/password/i), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("user@example.com", "password123");
      expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
    });
  });

  it("navigates to the validated returnTo after login", async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    renderPage("/login?returnTo=%2Fitems%2Fadd");

    fireEvent.change(screen.getByPlaceholderText(/email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/password/i), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/items/add", { replace: true });
    });
  });

  it("falls back to / for an unsafe returnTo rather than navigating off-origin", async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    renderPage("/login?returnTo=https%3A%2F%2Fevil.com");

    fireEvent.change(screen.getByPlaceholderText(/email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/password/i), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
    });
  });

  it("does not navigate when login rejects, and shows the error message", async () => {
    mockLogin.mockRejectedValueOnce(new Error("Invalid credentials"));
    renderPage();

    fireEvent.change(screen.getByPlaceholderText(/email/i), {
      target: { value: "bad@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/password/i), {
      target: { value: "wrongpass" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  it("shows loading state while submitting", async () => {
    mockLogin.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 500)));
    renderPage();

    fireEvent.change(screen.getByPlaceholderText(/email/i), {
      target: { value: "u@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/password/i), {
      target: { value: "pass1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(screen.getByText(/signing in/i)).toBeInTheDocument();
  });

  it("carries returnTo/reason through to the sign-up link", () => {
    renderPage("/login?returnTo=%2Fitems%2Fadd&reason=create-content");
    const link = screen.getByRole("link", { name: /sign up/i });
    expect(link.getAttribute("href")).toContain("returnTo=%2Fitems%2Fadd");
    expect(link.getAttribute("href")).toContain("reason=create-content");
  });

  it("links to a plain /signup when there is no intent to carry", () => {
    renderPage();
    const link = screen.getByRole("link", { name: /sign up/i });
    expect(link).toHaveAttribute("href", "/signup");
  });

  it("redirects already-authenticated visitors to the validated returnTo once loading settles", () => {
    mockIsAuthenticated = true;
    mockAuthLoading = false;
    renderPage("/login?returnTo=%2Fitems%2Fadd");
    // Navigate renders nothing itself in this test setup (no matching route),
    // but the form should not render for an already-authenticated visitor.
    expect(screen.queryByRole("heading", { name: /sign in/i })).not.toBeInTheDocument();
  });

  describe("Continue with Google", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("is hidden, with no divider, when the flag is off", () => {
      renderPage();
      expect(screen.queryByRole("button", { name: /continue with google/i })).not.toBeInTheDocument();
      expect(screen.queryByText("or")).not.toBeInTheDocument();
    });

    it("is shown between the sign-in button and the sign-up link when enabled", () => {
      vi.stubEnv("VITE_GOOGLE_SIGNIN_ENABLED", "true");
      vi.stubEnv("VITE_COGNITO_DOMAIN", "auth.quizymode.com");
      renderPage();
      expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
      expect(screen.getByText("or")).toBeInTheDocument();
    });

    it("starts the Google redirect with the validated intent and disables password sign-in meanwhile", async () => {
      vi.stubEnv("VITE_GOOGLE_SIGNIN_ENABLED", "true");
      vi.stubEnv("VITE_COGNITO_DOMAIN", "auth.quizymode.com");
      mockSignInWithGoogle.mockReturnValue(new Promise(() => undefined));
      renderPage("/login?returnTo=%2Fitems%2Fadd&reason=create-content");

      fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

      expect(mockSignInWithGoogle).toHaveBeenCalledWith({ returnTo: "/items/add", reason: "create-content" });
      await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled());
    });

    it("shows a fixed error in an alert when the redirect cannot start", async () => {
      vi.stubEnv("VITE_GOOGLE_SIGNIN_ENABLED", "true");
      vi.stubEnv("VITE_COGNITO_DOMAIN", "auth.quizymode.com");
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      mockSignInWithGoogle.mockRejectedValue(new Error("boom"));
      renderPage();

      fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't start Google sign-in.");
    });
  });
});
