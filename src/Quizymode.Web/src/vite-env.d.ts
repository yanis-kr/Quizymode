/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Cognito hosted-UI custom domain used for Google sign-in (for example auth.quizymode.com). */
  readonly VITE_COGNITO_DOMAIN?: string;
  /** Google sign-in is enabled only when this is exactly "true" and VITE_COGNITO_DOMAIN is set. */
  readonly VITE_GOOGLE_SIGNIN_ENABLED?: string;
}

declare const __APP_VERSION__: string;
declare const __BUILD_LABEL__: string;
declare const __BUILD_VERSION__: string;
declare const __BUILD_TIME__: string;
declare const __ABOUT_HTML__: string;

interface Window {
  turnstile?: {
    render: (
      container: HTMLElement,
      options: {
        sitekey: string;
        callback?: (token: string) => void;
        "expired-callback"?: () => void;
        "error-callback"?: () => void;
      }
    ) => string;
    reset: (widgetId: string) => void;
    remove: (widgetId: string) => void;
  };
}

declare module "*.md?raw" {
  const content: string;
  export default content;
}

