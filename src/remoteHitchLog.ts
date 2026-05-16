export const REMOTE_HITCH_LOG_ENDPOINT = "/api/hitch-log";
export const REMOTE_HITCH_LOG_MAX_BODY_BYTES = 128 * 1024;
export const REMOTE_HITCH_LOG_MAX_RECORDS = 10;

export type RemoteHitchLogDeploymentMetadata = {
  readonly vercelEnv: string;
  readonly vercelUrl: string;
  readonly gitCommitSha: string;
  readonly gitCommitRef: string;
  readonly gitCommitMessage: string;
};

export type RemoteHitchLogEnvelope = {
  readonly receivedAtIso: string;
  readonly appVersion: string;
  readonly source: string;
  readonly sessionId: string;
  readonly passId: string;
  readonly passLabel: string;
  readonly passIndex: number | null;
  readonly href: string;
  readonly userAgent: string;
  readonly deployment: RemoteHitchLogDeploymentMetadata;
  readonly records: readonly unknown[];
};

export type RemoteHitchLogNormalizeOptions = {
  readonly receivedAtIso: string;
  readonly deployment: RemoteHitchLogDeploymentMetadata;
  readonly fallbackAppVersion?: string;
};

export type RemoteHitchLogNormalizeResult =
  | {
      readonly ok: true;
      readonly envelope: RemoteHitchLogEnvelope;
      readonly jsonLines: string;
      readonly recordCount: number;
    }
  | {
      readonly ok: false;
      readonly status: number;
      readonly error: string;
    };

export function normalizeRemoteHitchLogPayload(
  payload: unknown,
  options: RemoteHitchLogNormalizeOptions
): RemoteHitchLogNormalizeResult {
  if (!isPlainObject(payload)) {
    return { ok: false, status: 400, error: "Expected a JSON object payload." };
  }

  const estimatedBodyBytes = getUtf8ByteLength(JSON.stringify(payload));
  if (estimatedBodyBytes > REMOTE_HITCH_LOG_MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: "Remote hitch-log payload is too large." };
  }

  const records = readPayloadRecords(payload);
  if (records.length === 0) {
    return { ok: false, status: 400, error: "Expected at least one hitch record." };
  }
  if (records.length > REMOTE_HITCH_LOG_MAX_RECORDS) {
    return {
      ok: false,
      status: 413,
      error: `Too many hitch records in one request; max is ${REMOTE_HITCH_LOG_MAX_RECORDS}.`
    };
  }

  const firstRecord = isPlainObject(records[0]) ? records[0] : {};
  const firstPass = isPlainObject(firstRecord.logPass) ? firstRecord.logPass : {};
  const envelope: RemoteHitchLogEnvelope = {
    receivedAtIso: options.receivedAtIso,
    appVersion: sanitizeMetadataString(readString(payload.appVersion) ?? options.fallbackAppVersion ?? "unknown", "unknown"),
    source: sanitizeMetadataString(readString(payload.source) ?? "browser", "browser"),
    sessionId: sanitizeMetadataString(
      readString(payload.sessionId) ?? readString(firstPass.sessionId) ?? "unknown-session",
      "unknown-session"
    ),
    passId: sanitizeMetadataString(
      readString(payload.passId) ?? readString(firstPass.passId) ?? "unknown-pass",
      "unknown-pass"
    ),
    passLabel: sanitizeMetadataString(
      readString(payload.passLabel) ?? readString(firstPass.label) ?? "unknown",
      "unknown"
    ),
    passIndex: readNumber(payload.passIndex) ?? readNumber(firstPass.passIndex),
    href: sanitizeMetadataString(readString(payload.href) ?? "", ""),
    userAgent: sanitizeMetadataString(readString(payload.userAgent) ?? "", ""),
    deployment: options.deployment,
    records
  };

  return {
    ok: true,
    envelope,
    jsonLines: createRemoteHitchLogJsonLines(envelope),
    recordCount: records.length
  };
}

export function createRemoteHitchLogBlobPath(envelope: RemoteHitchLogEnvelope): string {
  const day = envelope.receivedAtIso.slice(0, 10) || "unknown-date";
  const timestamp = sanitizePathToken(envelope.receivedAtIso.replace(/[.:]/g, "-"), "received");
  const version = sanitizePathToken(`v${envelope.appVersion}`, "vunknown");
  const commit = sanitizePathToken(envelope.deployment.gitCommitSha.slice(0, 12), "unknown-commit");
  const session = sanitizePathToken(envelope.sessionId, "unknown-session");
  const pass = sanitizePathToken(envelope.passId, "unknown-pass");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `hitches/${day}/${version}/${commit}/${session}/${pass}/${timestamp}-${suffix}.jsonl`;
}

export function createRemoteHitchLogJsonLines(envelope: RemoteHitchLogEnvelope): string {
  return envelope.records
    .map((record, index) => JSON.stringify({
      type: "voxel.remote-hitch",
      receivedAt: envelope.receivedAtIso,
      appVersion: envelope.appVersion,
      source: envelope.source,
      sessionId: envelope.sessionId,
      passId: envelope.passId,
      passLabel: envelope.passLabel,
      passIndex: envelope.passIndex,
      href: envelope.href,
      userAgent: envelope.userAgent,
      deployment: envelope.deployment,
      batch: {
        index,
        count: envelope.records.length
      },
      hitch: record
    }))
    .join("\n") + "\n";
}

export function isRemoteHitchLogAllowedOrigin(
  origin: string | null | undefined,
  requestHost: string | null | undefined,
  extraAllowedOrigins: readonly string[] = []
): boolean {
  if (!origin) return false;

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }

  const originHost = originUrl.host.toLowerCase();
  const host = (requestHost ?? "").toLowerCase();
  if (originUrl.protocol !== "https:" && originUrl.protocol !== "http:") return false;
  if (host.length > 0 && originHost === host) return true;

  for (const allowedOrigin of extraAllowedOrigins) {
    try {
      const allowedUrl = new URL(allowedOrigin);
      if (allowedUrl.host.toLowerCase() === originHost) return true;
    } catch {
      if (allowedOrigin.toLowerCase() === originHost) return true;
    }
  }

  return originUrl.protocol === "https:" &&
    originHost.endsWith(".vercel.app") &&
    (originHost === "voxel-engine-coral.vercel.app" || originHost.startsWith("voxel-engine-"));
}

function readPayloadRecords(payload: Record<string, unknown>): readonly unknown[] {
  if (Array.isArray(payload.records)) {
    return payload.records;
  }
  if ("record" in payload) {
    return [payload.record];
  }
  return [];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizeMetadataString(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return fallback;
  return trimmed.slice(0, 512);
}

function sanitizePathToken(value: string, fallback: string): string {
  const safe = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return safe.length > 0 ? safe : fallback;
}

function getUtf8ByteLength(value: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).length;
  }
  return value.length;
}
