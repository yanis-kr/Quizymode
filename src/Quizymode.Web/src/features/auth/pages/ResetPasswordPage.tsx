import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { confirmResetPassword, resetPassword } from "aws-amplify/auth";
import { useAuth } from "@/contexts/AuthContext";
import { SEO } from "@/components/SEO";
import {
  LOGIN_PATH,
  buildAuthIntentQuery,
  parseAuthIntent,
} from "@/features/auth/utils/authIntent";
import {
  GOOGLE_ONLY_HINT,
  REQUEST_SENT_MESSAGE,
  mapPasswordResetError,
} from "@/features/auth/utils/passwordResetErrors";

type Step = "request" | "confirm";

const inputClass =
  "appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm";
const primaryButtonClass =
  "w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50";

const ResetPasswordPage = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const intent = parseAuthIntent(location.search);
  const loginHref = `${LOGIN_PATH}${buildAuthIntentQuery(intent)}`;

  if (!authLoading && isAuthenticated && !passwordUpdated) {
    return <Navigate to={intent.returnTo} replace />;
  }

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await resetPassword({ username: email });
    } catch {
      // Deliberately ignored: every outcome shows the same message (no account enumeration).
    } finally {
      setIsLoading(false);
    }
    setNotice(REQUEST_SENT_MESSAGE);
    setStep("confirm");
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await confirmResetPassword({
        username: email,
        confirmationCode: code.trim(),
        newPassword,
      });
    } catch (err: unknown) {
      setError(mapPasswordResetError(err));
      setIsLoading(false);
      return;
    }

    setPasswordUpdated(true);
    try {
      await login(email, newPassword);
      navigate(intent.returnTo, { replace: true });
    } catch {
      // The password is already changed; fall back to the normal sign-in page.
      navigate(loginHref, { replace: true });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <SEO title="Reset password" noindex />
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-6">
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Reset your password
          </h2>

          {error && (
            <div role="alert" className="rounded-md bg-red-50 p-4 text-sm text-red-800">
              {error}
            </div>
          )}
          {notice && (
            <div role="status" className="rounded-md bg-blue-50 p-4 text-sm text-blue-900">
              {notice}
            </div>
          )}

          {step === "request" ? (
            <form className="space-y-4" onSubmit={handleRequest}>
              <p className="text-sm text-gray-600">
                Enter your email and we will send you a verification code.
              </p>
              <div>
                <label htmlFor="reset-email" className="sr-only">
                  Email
                </label>
                <input
                  id="reset-email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="Email"
                />
              </div>
              <button type="submit" disabled={isLoading} className={primaryButtonClass}>
                {isLoading ? "Sending..." : "Send code"}
              </button>
              <p className="text-xs text-gray-600">{GOOGLE_ONLY_HINT}</p>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleConfirm}>
              <div>
                <label htmlFor="reset-code" className="sr-only">
                  Verification code
                </label>
                <input
                  id="reset-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className={inputClass}
                  placeholder="Verification code"
                />
              </div>
              <div>
                <label htmlFor="reset-new-password" className="sr-only">
                  New password
                </label>
                <input
                  id="reset-new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={inputClass}
                  placeholder="New password"
                />
              </div>
              <button type="submit" disabled={isLoading} className={primaryButtonClass}>
                {isLoading ? "Resetting..." : "Reset password"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("request");
                  setError("");
                  setNotice("");
                  setCode("");
                  setNewPassword("");
                }}
                className="w-full text-center text-sm font-medium text-indigo-ink hover:text-indigo-500"
              >
                Use a different email or send a new code
              </button>
            </form>
          )}

          <div className="text-center text-sm">
            <Link to={loginHref} className="font-medium text-indigo-ink hover:text-indigo-500">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default ResetPasswordPage;
