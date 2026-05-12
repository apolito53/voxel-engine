import { createServer } from "node:http";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const PORT = Number(process.env.VOXEL_HITCH_LOG_PORT ?? 5174);
const ENDPOINT = "/__voxel_hitch_log";
const BODY_LIMIT_BYTES = 256 * 1024;
const ROOT_DIRECTORY = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOGS_DIRECTORY = resolve(ROOT_DIRECTORY, "logs");

const server = createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.url === "/health") {
    writeJson(response, 200, { ok: true, endpoint: ENDPOINT });
    return;
  }

  if (request.method !== "POST" || request.url !== ENDPOINT) {
    writeJson(response, 404, { ok: false, error: "Not found." });
    return;
  }

  try {
    const payload = await readJsonRequestBody(request);
    const logPath = await appendHitchLog(payload);
    writeJson(response, 204, { ok: true, logPath });
  } catch (error) {
    writeJson(response, 400, {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to write hitch log."
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Voxel hitch log server listening on http://${HOST}:${PORT}`);
  console.log(`POST ${ENDPOINT} -> ${LOGS_DIRECTORY}`);
});

server.on("error", (error) => {
  console.error("Voxel hitch log server failed:", error);
  process.exitCode = 1;
});

async function readJsonRequestBody(request) {
  const chunks = [];
  let byteLength = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    byteLength += buffer.byteLength;
    if (byteLength > BODY_LIMIT_BYTES) {
      throw new Error("Hitch log payload is too large.");
    }
    chunks.push(buffer);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  if (rawBody.trim().length === 0) {
    throw new Error("Hitch log payload is empty.");
  }
  return JSON.parse(rawBody);
}

async function appendHitchLog(payload) {
  await mkdir(LOGS_DIRECTORY, { recursive: true });
  const dateStamp = new Date().toISOString().slice(0, 10);
  const logPath = resolve(LOGS_DIRECTORY, `hitches-${dateStamp}.jsonl`);
  await appendFile(
    logPath,
    `${JSON.stringify({ receivedAt: new Date().toISOString(), payload })}\n`,
    "utf8"
  );
  return logPath;
}

function setCorsHeaders(response) {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "POST, OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
}

function writeJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  if (statusCode === 204) {
    response.end();
    return;
  }
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(payload));
}
