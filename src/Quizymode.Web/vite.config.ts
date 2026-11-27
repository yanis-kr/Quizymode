import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";
import { marked } from "marked";

function readAppVersion(): string {
  const propsPath = path.resolve(__dirname, "../../Directory.Build.props");
  const props = fs.readFileSync(propsPath, "utf8");
  const match = props.match(/<QuizymodeVersion>([^<]+)<\/QuizymodeVersion>/);
  if (!match) {
    throw new Error("QuizymodeVersion not found in Directory.Build.props");
  }

  return match[1].trim();
}

function resolveBuildLabel(): string {
  const sha = (process.env.VITE_GIT_SHA ?? process.env.GITHUB_SHA ?? "local").slice(0, 7);
  const eventName = process.env.GITHUB_EVENT_NAME;
  const ref = process.env.GITHUB_REF ?? "";
  const prMatch = ref.match(/refs\/pull\/(\d+)\/merge/);

  if (eventName === "pull_request" && prMatch) {
    return `pr-${prMatch[1]}.${sha}`;
  }

  if (process.env.GITHUB_SHA) {
    return `sha.${sha}`;
  }

  return "local";
}

const appVersion = readAppVersion();
const buildLabel = resolveBuildLabel();
const buildVersion = `${appVersion}+${buildLabel}`;
const buildTimestamp = new Date().toISOString();

const aboutMarkdown = fs.readFileSync(
  path.resolve(__dirname, "../../docs/about.md"),
  "utf8"
);
const aboutHtml = marked.parse(aboutMarkdown) as string;

/** Source folders whose .webp files ship content-hashed under assets/m (AC 3.21.7): curated pictures, About screenshots. */
const HASHED_WEBP_DIRS = ["assets/curated/", "assets/about/"];
const isHashedWebpSource = (filePath: string): boolean =>
  HASHED_WEBP_DIRS.some((dir) => filePath.replace(/\\/g, "/").includes(dir));

function injectBuildMetadata() {
  return {
    name: "quizymode-build-metadata",
    transformIndexHtml(html: string) {
      return html
        .replace(/%QUIZYMODE_APP_VERSION%/g, appVersion)
        .replace(/%QUIZYMODE_BUILD_LABEL%/g, buildLabel)
        .replace(/%QUIZYMODE_BUILD_VERSION%/g, buildVersion)
        .replace(/%QUIZYMODE_BUILD_TIME%/g, buildTimestamp);
    },
  };
}

// A production bundle without VITE_API_URL silently falls back to https://localhost:8082 (src/api/client.ts),
// so fail the build instead. A UTF-8 BOM in .env.production hid the first key from Vite 8 this way.
function requireProductionApiUrl() {
  return {
    name: "quizymode-require-production-api-url",
    configResolved(config: { command: string; mode: string; env: Record<string, unknown> }) {
      if (config.command === "build" && config.mode === "production" && !config.env.VITE_API_URL) {
        throw new Error("VITE_API_URL is not set for the production build (check .env.production for a BOM).");
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), injectBuildMetadata(), requireProductionApiUrl()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_LABEL__: JSON.stringify(buildLabel),
    __BUILD_VERSION__: JSON.stringify(buildVersion),
    __BUILD_TIME__: JSON.stringify(buildTimestamp.slice(0, 10)),
    __ABOUT_HTML__: JSON.stringify(aboutHtml),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 7000,
    strictPort: false,
    host: "localhost", // Only listen on localhost (set to true to allow network access)
    proxy: {
      "/api": {
        target: "https://localhost:8082",
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  build: {
    outDir: "dist",
    // Maps are generated for decoding reported stacks by hand, but bundles do not reference them and
    // deploy.yml never uploads *.map files; CI publishes them as a build artifact instead (OBS-001).
    sourcemap: "hidden",
    // Curated question pictures (#407) and About screenshots (#885) are always emitted as files (never data: URIs).
    assetsInlineLimit: (filePath) => (isHashedWebpSource(filePath) ? false : undefined),
    rolldownOptions: {
      output: {
        // Curated pictures and About screenshots ship as assets/m/<hash>.webp so deploy.yml can give them an explicit
        // content type and its immutable cache (the name changes whenever the file does).
        assetFileNames: (assetInfo) => {
          const sources = [...(assetInfo.originalFileNames ?? []), ...(assetInfo.names ?? [])];
          return sources.some(isHashedWebpSource) ? "assets/m/[hash][extname]" : "assets/[name]-[hash][extname]";
        },
        // Rolldown (Vite 8) has no object-form manualChunks; these groups keep the same vendor/query split.
        codeSplitting: {
          groups: [
            { name: "vendor", test: /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
            { name: "query", test: /[\\/]node_modules[\\/]@tanstack[\\/](react-query|query-core)[\\/]/ },
          ],
        },
      },
    },
  },
});
