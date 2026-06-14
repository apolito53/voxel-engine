import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { appendFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
// Keep the standalone log receiver paired with the experiment branch dev port.
// Main keeps 5174; this branch defaults to 5194 for parallel local sessions.
const PORT = Number(process.env.VOXEL_HITCH_LOG_PORT ?? 5194);
const HITCH_ENDPOINT = "/__voxel_hitch_log";
const VISUAL_TEST_ENDPOINT = "/__voxel_visual_test";
const COMBAT_LOG_ENDPOINT = "/__voxel_combat_log";
const HITCH_BODY_LIMIT_BYTES = 256 * 1024;
const COMBAT_LOG_BODY_LIMIT_BYTES = 512 * 1024;
const VISUAL_TEST_BODY_LIMIT_BYTES = Number(process.env.VOXEL_VISUAL_TEST_BODY_LIMIT_BYTES ?? 96 * 1024 * 1024);
const ROOT_DIRECTORY = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOGS_DIRECTORY = resolve(ROOT_DIRECTORY, "logs");
const VISUAL_RUNS_DIRECTORY = resolve(LOGS_DIRECTORY, "visual-runs");
const execFileAsync = promisify(execFile);

const server = createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.url === "/health") {
    writeJson(response, 200, {
      ok: true,
      endpoints: {
        hitches: HITCH_ENDPOINT,
        visualTests: VISUAL_TEST_ENDPOINT,
        combat: COMBAT_LOG_ENDPOINT
      }
    });
    return;
  }

  if (request.method === "POST" && request.url === HITCH_ENDPOINT) {
    try {
      const payload = await readJsonRequestBody(request, HITCH_BODY_LIMIT_BYTES);
      const logPath = await appendHitchLog(payload);
      writeJson(response, 204, { ok: true, logPath });
    } catch (error) {
      writeJson(response, 400, {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to write hitch log."
      });
    }
    return;
  }

  if (request.method === "POST" && request.url === COMBAT_LOG_ENDPOINT) {
    try {
      const payload = await readJsonRequestBody(request, COMBAT_LOG_BODY_LIMIT_BYTES);
      writeJson(response, 200, await appendCombatLog(payload));
    } catch (error) {
      writeJson(response, 400, {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to write combat log."
      });
    }
    return;
  }

  if (request.method === "POST" && request.url === VISUAL_TEST_ENDPOINT) {
    try {
      const payload = await readJsonRequestBody(request, VISUAL_TEST_BODY_LIMIT_BYTES);
      writeJson(response, 200, await writeVisualTestRun(payload));
    } catch (error) {
      writeJson(response, 400, {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to write visual test recording."
      });
    }
    return;
  }

  if (request.method !== "POST") {
    writeJson(response, 404, { ok: false, error: "Not found." });
    return;
  }
  writeJson(response, 404, { ok: false, error: "Not found." });
});

server.listen(PORT, HOST, () => {
  console.log(`Voxel hitch log server listening on http://${HOST}:${PORT}`);
  console.log(`POST ${HITCH_ENDPOINT} -> ${LOGS_DIRECTORY}`);
  console.log(`POST ${COMBAT_LOG_ENDPOINT} -> ${resolve(LOGS_DIRECTORY, "combat")}`);
  console.log(`POST ${VISUAL_TEST_ENDPOINT} -> ${VISUAL_RUNS_DIRECTORY}`);
});

server.on("error", (error) => {
  console.error("Voxel hitch log server failed:", error);
  process.exitCode = 1;
});

async function readJsonRequestBody(request, bodyLimitBytes) {
  const chunks = [];
  let byteLength = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    byteLength += buffer.byteLength;
    if (byteLength > bodyLimitBytes) {
      throw new Error(`Payload is too large. Limit is ${bodyLimitBytes} bytes.`);
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
  const passToken = getPayloadPassToken(payload);
  const logPath = resolve(LOGS_DIRECTORY, `hitches-${dateStamp}-${passToken}.jsonl`);
  await appendFile(
    logPath,
    `${JSON.stringify({ receivedAt: new Date().toISOString(), payload })}\n`,
    "utf8"
  );
  return logPath;
}

async function appendCombatLog(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Combat log payload must be a JSON object.");
  }

  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  if (entries.length === 0) throw new Error("Combat log payload has no entries.");

  const receivedAt = new Date().toISOString();
  const dateStamp = typeof payload.sentAtIso === "string" && payload.sentAtIso.length >= 10
    ? payload.sentAtIso.slice(0, 10)
    : receivedAt.slice(0, 10);
  const sessionToken = sanitizeLogToken(
    typeof payload.sessionId === "string" ? payload.sessionId : "",
    "combat-session"
  );
  const combatDirectory = resolve(LOGS_DIRECTORY, "combat");
  const logPath = resolve(combatDirectory, `combat-${dateStamp}-${sessionToken}.jsonl`);
  const batchId = typeof payload.batchId === "number" && Number.isFinite(payload.batchId)
    ? payload.batchId
    : null;

  await mkdir(combatDirectory, { recursive: true });
  const lines = entries.map((entry, index) => JSON.stringify({
    type: "voxel.combat-log.entry",
    receivedAt,
    sessionId: sessionToken,
    batchId,
    batchIndex: index,
    context: payload.context && typeof payload.context === "object" ? payload.context : {},
    entry
  }));
  await appendFile(logPath, `${lines.join("\n")}\n`, "utf8");

  return {
    ok: true,
    logPath,
    count: entries.length
  };
}

async function writeVisualTestRun(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Visual test payload must be a JSON object.");
  }

  const label = sanitizeLogToken(typeof payload.label === "string" ? payload.label : "visual-test", "visual-test");
  const startedAtIso = typeof payload.startedAtIso === "string" ? payload.startedAtIso : new Date().toISOString();
  const dateStamp = startedAtIso.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const timestampToken = sanitizeLogToken(startedAtIso.replace(/[.:]/g, "-"), "recording");
  const suffix = Math.random().toString(36).slice(2, 8);
  const directory = resolve(VISUAL_RUNS_DIRECTORY, dateStamp, `${timestampToken}-${label}-${suffix}`);

  await mkdir(directory, { recursive: true });

  const video = decodeDataUrl(payload.videoDataUrl, "video/webm");
  const videoExtension = getExtensionForMime(video.mimeType, ".webm");
  const videoFileName = `recording${videoExtension}`;
  const videoPath = join(directory, videoFileName);
  await writeFile(videoPath, video.bytes);
  const extractedVideoFrames = await extractVideoReviewFrames(videoPath, directory);

  const frameManifests = [];
  const frameSamples = Array.isArray(payload.frameSamples) ? payload.frameSamples : [];
  const framesDirectory = join(directory, "frames");
  if (frameSamples.length > 0) {
    await mkdir(framesDirectory, { recursive: true });
  }

  for (let index = 0; index < frameSamples.length; index += 1) {
    const frame = frameSamples[index];
    if (!frame || typeof frame !== "object" || typeof frame.dataUrl !== "string") continue;
    const decodedFrame = decodeDataUrl(frame.dataUrl, "image/webp");
    const frameExtension = getExtensionForMime(decodedFrame.mimeType, ".webp");
    const frameFileName = `frame-${String(frameManifests.length).padStart(3, "0")}${frameExtension}`;
    const framePath = join(framesDirectory, frameFileName);
    await writeFile(framePath, decodedFrame.bytes);
    frameManifests.push({
      index: frameManifests.length,
      capturedAtMs: Number.isFinite(frame.capturedAtMs) ? frame.capturedAtMs : null,
      path: framePath,
      relativePath: `frames/${frameFileName}`,
      mimeType: decodedFrame.mimeType,
      bytes: decodedFrame.bytes.byteLength
    });
  }

  const manifest = createVisualTestManifest(payload, {
    directory,
    videoPath,
    videoRelativePath: videoFileName,
    videoMimeType: video.mimeType,
    videoBytes: video.bytes.byteLength,
    frames: frameManifests,
    extractedVideoFrames
  });
  const manifestPath = join(directory, "manifest.json");
  const reviewPath = join(directory, "review.html");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  await writeFile(reviewPath, createVisualTestReviewHtml(manifest), "utf8");

  return {
    ok: true,
    directory,
    manifestPath,
    videoPath,
    reviewPath,
    frameCount: frameManifests.length
  };
}

function createVisualTestManifest(payload, files) {
  return {
    type: "voxel.visual-test-recording",
    receivedAt: new Date().toISOString(),
    appVersion: typeof payload.appVersion === "string" ? payload.appVersion : "unknown",
    label: typeof payload.label === "string" ? payload.label : "visual-test",
    status: typeof payload.status === "string" ? payload.status : "stopped",
    error: typeof payload.error === "string" ? payload.error : null,
    href: typeof payload.href === "string" ? payload.href : "",
    userAgent: typeof payload.userAgent === "string" ? payload.userAgent : "",
    startedAtIso: typeof payload.startedAtIso === "string" ? payload.startedAtIso : null,
    endedAtIso: typeof payload.endedAtIso === "string" ? payload.endedAtIso : null,
    durationMs: Number.isFinite(payload.durationMs) ? payload.durationMs : null,
    viewport: payload.viewport ?? null,
    canvas: payload.canvas ?? null,
    recorder: {
      ...(payload.recorder && typeof payload.recorder === "object" ? payload.recorder : {}),
      videoPath: files.videoPath,
      videoRelativePath: files.videoRelativePath,
      videoMimeType: files.videoMimeType,
      videoBytes: files.videoBytes
    },
    logPass: payload.logPass ?? null,
    metadata: payload.metadata ?? {},
    files: {
      directory: files.directory,
      videoPath: files.videoPath,
      reviewPath: join(files.directory, "review.html"),
      frames: files.frames,
      extractedVideoFrames: files.extractedVideoFrames
    }
  };
}

function createVisualTestReviewHtml(manifest) {
  const title = escapeHtml(`Voxel visual test - ${manifest.label}`);
  const extractedFrameItems = manifest.files.extractedVideoFrames.map((frame) => {
    const caption = frame.capturedAtSeconds === null
      ? `video frame ${frame.index}`
      : `${frame.capturedAtSeconds.toFixed(2)}s`;
    return `<figure><img src="${escapeHtml(frame.relativePath)}" alt="${escapeHtml(caption)}"><figcaption>${escapeHtml(caption)}</figcaption></figure>`;
  }).join("\n");
  const browserFrameItems = manifest.files.frames.map((frame) => {
    const caption = frame.capturedAtMs === null
      ? `frame ${frame.index}`
      : `${(frame.capturedAtMs / 1000).toFixed(2)}s`;
    return `<figure><img src="${escapeHtml(frame.relativePath)}" alt="${escapeHtml(caption)}"><figcaption>${escapeHtml(caption)}</figcaption></figure>`;
  }).join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${title}</title>
    <style>
      body { margin: 24px; background: #111820; color: #e7f3f0; font: 14px/1.45 system-ui, sans-serif; }
      video { display: block; width: min(1200px, 100%); max-height: 72vh; background: #000; border: 1px solid #364653; }
      pre { white-space: pre-wrap; background: #0b1016; border: 1px solid #253340; padding: 12px; overflow: auto; }
      .frames { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin-top: 18px; }
      figure { margin: 0; padding: 8px; background: #18232d; border: 1px solid #2e3f4c; }
      img { display: block; width: 100%; height: auto; }
      figcaption { margin-top: 6px; color: #aac4cb; font-size: 12px; }
    </style>
  </head>
  <body>
    <h1>${title}</h1>
    <video controls src="${escapeHtml(manifest.recorder.videoRelativePath)}"></video>
    <h2>Manifest</h2>
    <pre>${escapeHtml(JSON.stringify({
      appVersion: manifest.appVersion,
      status: manifest.status,
      error: manifest.error,
      durationMs: manifest.durationMs,
      href: manifest.href,
      logPass: manifest.logPass,
      metadata: manifest.metadata
    }, null, 2))}</pre>
    <h2>Video Frames</h2>
    <div class="frames">${extractedFrameItems || "<p>No ffmpeg-extracted video frames were available.</p>"}</div>
    <h2>Browser Canvas Samples</h2>
    <div class="frames">${browserFrameItems || "<p>No browser canvas samples were available.</p>"}</div>
  </body>
</html>
`;
}

async function extractVideoReviewFrames(videoPath, directory) {
  const framesDirectory = join(directory, "video-frames");
  await mkdir(framesDirectory, { recursive: true });
  const outputPattern = join(framesDirectory, "video-frame-%03d.png");

  try {
    await execFileAsync("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      videoPath,
      "-vf",
      "fps=1",
      "-frames:v",
      "18",
      outputPattern
    ]);
  } catch {
    // ffmpeg is a local convenience, not a runtime dependency. The saved WebM
    // remains the source of truth even if frame extraction is unavailable.
    return [];
  }

  const entries = await readdir(framesDirectory, { withFileTypes: true });
  const frames = [];
  for (const entry of entries.filter((item) => item.isFile()).sort((a, b) => a.name.localeCompare(b.name))) {
    const framePath = join(framesDirectory, entry.name);
    const frameStats = await stat(framePath);
    frames.push({
      index: frames.length,
      capturedAtSeconds: frames.length,
      path: framePath,
      relativePath: `video-frames/${entry.name}`,
      mimeType: "image/png",
      bytes: frameStats.size
    });
  }
  return frames;
}

function decodeDataUrl(dataUrl, fallbackMimeType) {
  if (typeof dataUrl !== "string") {
    throw new Error("Expected a data URL.");
  }
  const match = /^data:([^;,]+)?(?:;[^,]*)?;base64,(.*)$/s.exec(dataUrl);
  if (!match) {
    throw new Error("Expected a base64 data URL.");
  }
  const mimeType = match[1] || fallbackMimeType;
  return {
    mimeType,
    bytes: Buffer.from(match[2], "base64")
  };
}

function getExtensionForMime(mimeType, fallback) {
  if (mimeType === "video/webm" || mimeType.startsWith("video/webm;")) return ".webm";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/jpeg") return ".jpg";
  return extname(mimeType) || fallback;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getPayloadPassToken(payload) {
  const passId = payload?.logPass?.passId;
  if (typeof passId === "string") {
    return sanitizeLogToken(passId, "unversioned");
  }

  const sessionId = typeof payload?.logPass?.sessionId === "string"
    ? sanitizeLogToken(payload.logPass.sessionId, "session")
    : "session";
  const passIndex = Number.isFinite(payload?.logPass?.passIndex)
    ? String(Math.max(0, Math.floor(payload.logPass.passIndex))).padStart(3, "0")
    : "000";
  return `${sessionId}-p${passIndex}-unversioned`;
}

function sanitizeLogToken(value, fallback) {
  const safe = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
  return safe.length > 0 ? safe : fallback;
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
