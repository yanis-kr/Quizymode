import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import type { Plugin } from "vite";

// Plugin to set correct content types for SEO files
const seoFilesPlugin = (): Plugin => ({
  name: "seo-files",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === "/sitemap.xml") {
        res.setHeader("Content-Type", "application/xml");
      } else if (req.url === "/robots.txt") {
        res.setHeader("Content-Type", "text/plain");
      }
      next();
    });
  },
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), seoFilesPlugin()],
  define: {
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
