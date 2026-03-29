import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";

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
  const sha = (process.env.GITHUB_SHA ?? process.env.VITE_GIT_SHA ?? "local").slice(0, 7);
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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_LABEL__: JSON.stringify(buildLabel),
    __BUILD_VERSION__: JSON.stringify(buildVersion),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 7000,
    strictPort: false, // Allow Vite to try another port if 7000 is in use (check console for actual port)
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
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          query: ["@tanstack/react-query"],
        },
      },
    },
  },
});
