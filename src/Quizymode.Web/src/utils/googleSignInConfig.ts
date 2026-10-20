/**
 * Google sign-in feature flag (AUTH-003, #118). Enabled only when VITE_GOOGLE_SIGNIN_ENABLED is exactly "true" AND a
 * Cognito hosted-UI domain is configured. Read at call time so tests can stub the environment. Never throws: a
 * misconfiguration keeps the feature off and the password flows untouched.
 */
export function getCognitoDomain(): string | null {
  const domain = import.meta.env.VITE_COGNITO_DOMAIN?.trim();
  return domain ? domain.replace(/^https?:\/\//, "").replace(/\/+$/, "") : null;
}

export function isGoogleSignInEnabled(): boolean {
  if (import.meta.env.VITE_GOOGLE_SIGNIN_ENABLED !== "true") {
    return false;
  }

  if (!getCognitoDomain()) {
    console.error(
      "VITE_GOOGLE_SIGNIN_ENABLED is true but VITE_COGNITO_DOMAIN is not set. Google sign-in stays disabled."
    );
    return false;
  }

  return true;
}
