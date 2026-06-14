import { appendFile, mkdir } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const ROOT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const LOGS_DIRECTORY = resolve(ROOT_DIRECTORY, "logs");
const COMBAT_LOG_ENDPOINT = "/__voxel_combat_log";
const COMBAT_LOG_BODY_LIMIT_BYTES = 512 * 1024;

export default defineConfig({
  plugins: [voxelCombatLogPlugin()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string): string | undefined {
          const normalizedId = id.replaceAll("\\", "/");

          // Three.js is the big stable rendering dependency. Keeping it in its
          // own chunk lets browsers cache renderer code across engine edits and
          // keeps the app chunk focused on code we actually change often.
          if (normalizedId.includes("/node_modules/three/")) return "vendor-three";

          // Leave a small escape hatch for future dependencies without having
          // to revisit this config every time one package gets added.
          if (normalizedId.includes("/node_modules/")) return "vendor";

          return undefined;
        }
      }
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5193,
    strictPort: true
  },
  preview: {
    host: "127.0.0.1",
    port: 4193,
    strictPort: true
  }
});

function voxelCombatLogPlugin(): Plugin {
  return {
    name: "voxel-combat-log-dev-endpoint",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = request.url?.split("?")[0] ?? "";
        if (url !== COMBAT_LOG_ENDPOINT) {
          next();
          return;
        }

        if (request.method === "OPTIONS") {
          response.statusCode = 204;
          response.end();
          return;
        }

        if (request.method !== "POST") {
          writeJsonResponse(response, 405, { ok: false, error: "Use POST to write combat logs." });
          return;
        }

        try {
          const payload = JSON.parse(await readRequestBody(request, COMBAT_LOG_BODY_LIMIT_BYTES));
          const result = await appendCombatLogPayload(payload);
          writeJsonResponse(response, 200, { ok: true, ...result });
        } catch (error) {
          writeJsonResponse(response, 400, {
            ok: false,
            error: error instanceof Error ? error.message : "Unable to write combat log."
          });
        }
      });
    }
  };
}

function readRequestBody(request: IncomingMessage, bodyLimitBytes: number): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    let byteLength = 0;

    request.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      byteLength += buffer.byteLength;
      if (byteLength > bodyLimitBytes) {
        rejectBody(new Error(`Payload is too large. Limit is ${bodyLimitBytes} bytes.`));
        request.destroy();
        return;
      }
      chunks.push(buffer);
    });
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      if (body.trim().length === 0) {
        rejectBody(new Error("Combat log payload is empty."));
        return;
      }
      resolveBody(body);
    });
    request.on("error", rejectBody);
  });
}

async function appendCombatLogPayload(payload: unknown): Promise<{
  readonly logPath: string;
  readonly count: number;
}> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Combat log payload must be a JSON object.");
  }

  const batch = payload as {
    readonly sessionId?: unknown;
    readonly batchId?: unknown;
    readonly sentAtIso?: unknown;
    readonly context?: unknown;
    readonly entries?: unknown;
  };
  const entries = Array.isArray(batch.entries) ? batch.entries : [];
  if (entries.length === 0) throw new Error("Combat log payload has no entries.");

  const receivedAt = new Date().toISOString();
  const dateStamp = typeof batch.sentAtIso === "string" && batch.sentAtIso.length >= 10
    ? batch.sentAtIso.slice(0, 10)
    : receivedAt.slice(0, 10);
  const sessionToken = sanitizeLogToken(
    typeof batch.sessionId === "string" ? batch.sessionId : "",
    "combat-session"
  );
  const logDirectory = resolve(LOGS_DIRECTORY, "combat");
  const logPath = resolve(logDirectory, `combat-${dateStamp}-${sessionToken}.jsonl`);
  const batchId = typeof batch.batchId === "number" && Number.isFinite(batch.batchId)
    ? batch.batchId
    : null;

  await mkdir(logDirectory, { recursive: true });
  const lines = entries.map((entry, index) => JSON.stringify({
    type: "voxel.combat-log.entry",
    receivedAt,
    sessionId: sessionToken,
    batchId,
    batchIndex: index,
    context: batch.context && typeof batch.context === "object" ? batch.context : {},
    entry
  }));
  await appendFile(logPath, `${lines.join("\n")}\n`, "utf8");
  return { logPath, count: entries.length };
}

function writeJsonResponse(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(payload));
}

function sanitizeLogToken(value: string, fallback: string): string {
  const safe = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
  return safe.length > 0 ? safe : fallback;
}
