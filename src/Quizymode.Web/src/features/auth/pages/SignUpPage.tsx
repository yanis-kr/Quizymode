import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usersApi } from "@/api/users";

const SignUpPage = () => {
  const navigate = useNavigate();
  const { signup, confirmSignup } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validate that username is not the same as email
    if (username.trim().toLowerCase() === email.trim().toLowerCase()) {
      setError("Username cannot be the same as email");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setIsLoading(true);

    try {
      // Check if username or email already exists
      const availability = await usersApi.checkAvailability({
        username: username.trim(),
        email: email.trim(),
      });

      const errors: string[] = [];
      if (!availability.isUsernameAvailable && availability.usernameError) {
        errors.push(availability.usernameError);
      }
      if (!availability.isEmailAvailable && availability.emailError) {
        errors.push(availability.emailError);
      }

      if (errors.length > 0) {
        setError(errors.join(". "));
        setIsLoading(false);
        return;
      }

      await signup(username, password, email);
      setNeedsConfirmation(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Sign up failed. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      // Use email for confirmation since Cognito username is now the email
      await confirmSignup(email, confirmationCode);
      navigate("/login");
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Confirmation failed. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (needsConfirmation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              Confirm your account
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              Please check your email for the confirmation code
            </p>
          </div>
          <form className="mt-8 space-y-6" onSubmit={handleConfirm}>
            {error && (
              <div className="rounded-md bg-red-50 p-4">
                <div className="text-sm text-red-800">{error}</div>
              </div>
            )}
            <div>
              <label htmlFor="code" className="sr-only">
                Confirmation Code
              </label>
              <input
                id="code"
                name="code"
                type="text"
                required
                value={confirmationCode}
                onChange={(e) => setConfirmationCode(e.target.value)}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Confirmation Code"
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {isLoading ? "Confirming..." : "Confirm"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Create your account
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSignUp}>
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-800">{error}</div>
            </div>
          )}
          <div className="rounded-md shadow-sm space-y-4">
            <div>
              <label htmlFor="username" className="sr-only">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Username"
              />
            </div>
            <div>
              <label htmlFor="email" className="sr-only">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Email"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Password (min 8 characters)"
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="sr-only">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Confirm Password"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {isLoading ? "Signing up..." : "Sign up"}
            </button>
          </div>

          <div className="text-center text-sm">
            <span className="text-gray-600">Already have an account? </span>
            <Link
              to="/login"
              className="font-medium text-indigo-600 hover:text-indigo-500"
            >
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SignUpPage;
