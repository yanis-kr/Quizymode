/// <reference types="vite/client" />

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
    remove: (widgetId: string) => void;
  };
}

declare module "*.md?raw" {
  const content: string;
  export default content;
}

