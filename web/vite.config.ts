import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";

// Code revision printed in Scientist reports (reproducibility); "unknown" outside a git checkout.
const gitRev = (() => { try { return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return "unknown"; } })();

// Dev: /api is proxied to the FastAPI backend (uvicorn on :8000), so no CORS setup is needed.
// Production: set VITE_API_BASE_URL to the deployed backend origin.
export default defineConfig({
  plugins: [react()],
  define: { __GIT_REV__: JSON.stringify(gitRev) },
  cacheDir: "node_modules/.vite-terrascope",
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: true } },
  },
});
