/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __BUILD_LABEL__: string;
declare const __BUILD_VERSION__: string;
declare const __BUILD_TIME__: string;

declare module "*.md?raw" {
  const content: string;
  export default content;
}

