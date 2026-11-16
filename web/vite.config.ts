import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";

// Vite's dev proxy is unavailable on Vercel. Fail a misconfigured hosted build early.
if (process.env.VERCEL === "1") {
  const origin = process.env.VITE_API_BASE_URL;
  // A reviewed root Services route sends /api to the backend on this same origin.
  let valid = process.env.VITE_API_MODE === "same-origin" && !origin;
  try {
    const url = new URL(origin ?? "");
    valid = valid || url.protocol === "https:" && url.origin === origin &&
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch { /* Report a configuration error without echoing the supplied value. */ }
  if (!valid) throw new Error("Set a public HTTPS VITE_API_BASE_URL, or VITE_API_MODE=same-origin with the root Services API route.");
}

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
    // TERRA_API_PROXY: another local backend (e.g. a worktree's own uvicorn on another port)
    proxy: { "/api": { target: process.env.TERRA_API_PROXY ?? "http://127.0.0.1:8000", changeOrigin: true } },
  },
});
