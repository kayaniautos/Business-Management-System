import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Frontend lives in web/ so it doesn't get pulled into the backend's
// tsconfig (which uses NodeNext module resolution — wrong mode for a
// Vite/browser app). Proxies /api to the Fastify dev server (see
// src/server) so the browser can just call fetch("/api/...") with no CORS
// setup needed in dev.
export default defineConfig({
  root: "web",
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:4000",
    },
  },
});
