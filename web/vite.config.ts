import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: /api is proxied to the FastAPI backend (uvicorn on :8000), so no CORS setup is needed.
// Production: set VITE_API_BASE_URL to the deployed backend origin.
export default defineConfig({
  plugins: [react()],
  cacheDir: "node_modules/.vite-terrascope",
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: true } },
  },
});
