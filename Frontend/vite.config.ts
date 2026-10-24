import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The dashboard reads the backend's committed artifacts directly, so there is one source of truth:
// Backend/data/build (generated JSON/CSV) and Backend/data/snapshot (verified inputs).
const backendData = fileURLToPath(new URL("../Backend/data", import.meta.url));

export default defineConfig({
  // Relative base so the static build works from any sub-path (GitHub Pages, S3, a file share).
  base: "./",
  plugins: [react()],
  resolve: {
    alias: { "@backend": backendData },
  },
  server: {
    fs: { allow: [".", backendData] },
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 900,
  },
});
