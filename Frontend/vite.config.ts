import type { IncomingMessage } from "node:http";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// The dashboard reads the backend's committed artifacts directly, so there is one source of truth:
// Backend/data/build (generated JSON/CSV) and Backend/data/snapshot (verified inputs).
const backendData = fileURLToPath(new URL("../Backend/data", import.meta.url));

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * `npm run dev` has no Vercel runtime, so this mounts api/chat.ts at /api/chat on the dev server.
 * GEMINI_API_KEY comes from the shell or from .env.local.
 */
function chatApiDev(): Plugin {
  return {
    name: "watt-if-chat-api-dev",
    apply: "serve",
    configureServer(server) {
      for (const [k, v] of Object.entries(loadEnv(server.config.mode, server.config.root, ["GEMINI_", "GOOGLE_API_KEY"]))) process.env[k] ??= v;
      server.middlewares.use("/api/chat", async (req, res, next) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("Allow", "POST");
          res.end();
          return;
        }
        try {
          const { POST } = (await server.ssrLoadModule("/api/chat.ts")) as { POST: (r: Request) => Promise<Response> };
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
          const aborted = new AbortController();
          res.on("close", () => aborted.abort());
          const response = await POST(new Request("http://localhost/api/chat", { method: "POST", headers, body: await readBody(req), signal: aborted.signal }));
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          if (response.body) for await (const chunk of response.body) res.write(chunk);
          res.end();
        } catch (err) {
          next(err);
        }
      });
    },
  };
}

export default defineConfig({
  // Relative base so the static build works from any sub-path (GitHub Pages, S3, a file share).
  base: "./",
  plugins: [react(), chatApiDev()],
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
