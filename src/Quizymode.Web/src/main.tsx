import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { configureAmplify } from "./utils/amplifyConfig";
import { AuthProvider } from "./contexts/AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";
import { installClientErrorReporting } from "./features/errorReporting/clientErrorReporter";
import "./index.css";
import App from "./App.tsx";

// Report runtime errors, failed script loads, and unhandled rejections (OBS-001) before anything else runs.
installClientErrorReporting();

// Configure AWS Amplify with error handling
try {
  configureAmplify();
} catch (error) {
  console.error("Failed to configure Amplify:", error);
}

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

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
