import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import "aws-amplify/auth/enable-oauth-listener";
import { configureAmplify } from "./utils/amplifyConfig";
import { isGoogleSignInEnabled } from "./utils/googleSignInConfig";
import { installOAuthOutcomeListener } from "./features/auth/utils/oauthOutcome";
import { queryClient } from "./api/queryClient";
import { AuthProvider } from "./contexts/AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";
import { installClientErrorReporting } from "./features/errorReporting/clientErrorReporter";
import { captureAttribution } from "./utils/attributionCapture";
import "./index.css";
import App from "./App.tsx";

// Report runtime errors, failed script loads, and unhandled rejections (OBS-001) before anything else runs.
installClientErrorReporting();

// Capture referrer/UTM/click-id signals before the router mounts and can rewrite the URL
// (QuizModePage, ExploreModePage). Must read window.location directly; no route exists yet.
if (window.location.pathname !== "/auth/callback") {
  captureAttribution();
}

// Capture the Google OAuth redirect result (AUTH-003) before Amplify is configured: Amplify's Hub does not replay
// events to late subscribers and a failed redirect reports before React renders.
if (isGoogleSignInEnabled()) {
  installOAuthOutcomeListener();
}

// Configure AWS Amplify with error handling
try {
  configureAmplify();
} catch (error) {
  console.error("Failed to configure Amplify:", error);
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <HelmetProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </ErrorBoundary>
    </HelmetProvider>
  </StrictMode>
);
