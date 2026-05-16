import { put } from "@vercel/blob";
import {
  createRemoteHitchLogBlobPath,
  isRemoteHitchLogAllowedOrigin,
  normalizeRemoteHitchLogPayload,
  type RemoteHitchLogDeploymentMetadata
} from "../src/remoteHitchLog";

type HeaderValue = string | string[] | undefined;

type VercelRequestLike = {
  readonly method?: string;
  readonly headers: Record<string, HeaderValue>;
  readonly body?: unknown;
};

type VercelResponseLike = {
  status(code: number): VercelResponseLike;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
};

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "128kb"
    }
  }
};

export default async function handler(request: VercelRequestLike, response: VercelResponseLike): Promise<void> {
  const origin = getHeader(request, "origin");
  const requestHost = getHeader(request, "x-forwarded-host") ?? getHeader(request, "host");
  const extraAllowedOrigins = readAllowedOrigins();
  const allowedOrigin = isRemoteHitchLogAllowedOrigin(origin, requestHost, extraAllowedOrigins);
  if (allowedOrigin && origin) {
    setCorsHeaders(response, origin);
  }

  if (request.method === "OPTIONS") {
    response.status(allowedOrigin ? 200 : 403).json({ ok: allowedOrigin });
    return;
  }

  if (request.method !== "POST") {
    response.status(405).json({ ok: false, error: "Use POST to write hitch logs." });
    return;
  }

  if (!allowedOrigin) {
    response.status(403).json({ ok: false, error: "Origin is not allowed to write hitch logs." });
    return;
  }

  const payload = parseRequestBody(request.body);
  if (!payload.ok) {
    response.status(400).json({ ok: false, error: payload.error });
    return;
  }

  const normalized = normalizeRemoteHitchLogPayload(payload.value, {
    receivedAtIso: new Date().toISOString(),
    deployment: readDeploymentMetadata()
  });
  if (!normalized.ok) {
    response.status(normalized.status).json({ ok: false, error: normalized.error });
    return;
  }

  const pathname = createRemoteHitchLogBlobPath(normalized.envelope);
  try {
    await put(pathname, normalized.jsonLines, {
      access: "private",
      allowOverwrite: false,
      contentType: "application/jsonl"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Blob write failure.";
    response.status(500).json({ ok: false, error: `Could not write remote hitch log: ${message}` });
    return;
  }

  response.status(200).json({
    ok: true,
    pathname,
    count: normalized.recordCount,
    appVersion: normalized.envelope.appVersion,
    deployment: normalized.envelope.deployment
  });
}

function parseRequestBody(body: unknown): { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: string } {
  if (typeof body === "string") {
    try {
      return { ok: true, value: JSON.parse(body) };
    } catch {
      return { ok: false, error: "Request body is not valid JSON." };
    }
  }

  if (body instanceof Uint8Array) {
    const text = Buffer.from(body).toString("utf8");
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch {
      return { ok: false, error: "Request body is not valid JSON." };
    }
  }

  if (typeof body === "object" && body !== null) {
    return { ok: true, value: body };
  }

  return { ok: false, error: "Request body is empty." };
}

function getHeader(request: VercelRequestLike, name: string): string | null {
  const direct = request.headers[name] ?? request.headers[name.toLowerCase()];
  if (Array.isArray(direct)) return direct[0] ?? null;
  return typeof direct === "string" ? direct : null;
}

function setCorsHeaders(response: VercelResponseLike, origin: string): void {
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "content-type");
  response.setHeader("Access-Control-Max-Age", "86400");
  response.setHeader("Vary", "Origin");
}

function readAllowedOrigins(): readonly string[] {
  return (process.env.VOXEL_LOG_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function readDeploymentMetadata(): RemoteHitchLogDeploymentMetadata {
  return {
    vercelEnv: process.env.VERCEL_ENV ?? "unknown",
    vercelUrl: process.env.VERCEL_URL ?? "",
    gitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? "",
    gitCommitRef: process.env.VERCEL_GIT_COMMIT_REF ?? "",
    gitCommitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? ""
  };
}
