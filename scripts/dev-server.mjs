import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const DEFAULT_PORT = "5173";
const ROOT_DIRECTORY = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOGS_DIRECTORY = resolve(ROOT_DIRECTORY, "logs");
const VITE_CLI_PATH = resolve(ROOT_DIRECTORY, "node_modules", "vite", "bin", "vite.js");

const forwardedArgs = process.argv.slice(2);
const viteArgs = createViteArgs(forwardedArgs);
const devServerRunId = createDevServerRunId();
const devServerPort = readOptionValue(viteArgs, "--port") ?? DEFAULT_PORT;
let childProcess = null;
let stopLogged = false;

await appendDevServerMarker("dev-server-start", {
  runId: devServerRunId,
  port: devServerPort,
  viteArgs,
  repo: await readRepoSnapshot(),
  runtime: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    ppid: process.ppid
  }
});

childProcess = spawn(process.execPath, [VITE_CLI_PATH, ...viteArgs], {
  cwd: ROOT_DIRECTORY,
  env: process.env,
  stdio: "inherit",
  shell: false
});

childProcess.on("exit", async (code, signal) => {
  await appendStopMarker(code, signal);
  process.exitCode = code ?? (signal ? 1 : 0);
});

childProcess.on("error", async (error) => {
  await appendDevServerMarker("dev-server-error", {
    runId: devServerRunId,
    port: devServerPort,
    error: error instanceof Error ? error.message : String(error)
  });
  console.error("Failed to start Vite dev server:", error);
  process.exitCode = 1;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (childProcess && !childProcess.killed) {
      childProcess.kill(signal);
      return;
    }
    process.exit(1);
  });
}

function createViteArgs(args) {
  const nextArgs = [...args];
  if (!hasOption(nextArgs, "--host")) {
    nextArgs.unshift(HOST);
    nextArgs.unshift("--host");
  }
  if (!hasOption(nextArgs, "--strictPort")) {
    nextArgs.unshift("--strictPort");
  }
  if (!hasOption(nextArgs, "--port")) {
    nextArgs.push("--port", DEFAULT_PORT);
  }
  return nextArgs;
}

function hasOption(args, optionName) {
  return args.some((arg) => arg === optionName || arg.startsWith(`${optionName}=`));
}

function readOptionValue(args, optionName) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === optionName) return args[index + 1];
    if (arg.startsWith(`${optionName}=`)) return arg.slice(optionName.length + 1);
  }
  return null;
}

async function readRepoSnapshot() {
  const [packageVersion, branch, commit, statusShort, unstagedShortstat, stagedShortstat] = await Promise.all([
    readPackageVersion(),
    readGitOutput(["rev-parse", "--abbrev-ref", "HEAD"]),
    readGitOutput(["rev-parse", "--short", "HEAD"]),
    readGitOutput(["status", "--short"]),
    readGitOutput(["diff", "--shortstat"]),
    readGitOutput(["diff", "--cached", "--shortstat"])
  ]);
  const dirtyFiles = statusShort
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);

  return {
    packageVersion,
    branch: branch.trim() || "unknown",
    commit: commit.trim() || "unknown",
    dirty: dirtyFiles.length > 0,
    dirtyCount: dirtyFiles.length,
    dirtyFiles: dirtyFiles.slice(0, 80),
    dirtyFilesTruncated: dirtyFiles.length > 80,
    unstagedShortstat: unstagedShortstat.trim(),
    stagedShortstat: stagedShortstat.trim()
  };
}

async function readPackageVersion() {
  try {
    const packageText = await readFile(resolve(ROOT_DIRECTORY, "package.json"), "utf8");
    const packageJson = JSON.parse(packageText);
    return typeof packageJson.version === "string" ? packageJson.version : "unknown";
  } catch {
    return "unknown";
  }
}

function readGitOutput(args) {
  return new Promise((resolveOutput) => {
    const git = spawn("git", args, {
      cwd: ROOT_DIRECTORY,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false
    });
    let stdout = "";

    git.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    git.on("error", () => {
      resolveOutput("");
    });
    git.on("close", (code) => {
      resolveOutput(code === 0 ? stdout : "");
    });
  });
}

async function appendStopMarker(code, signal) {
  if (stopLogged) return;
  stopLogged = true;
  await appendDevServerMarker("dev-server-stop", {
    runId: devServerRunId,
    port: devServerPort,
    exitCode: code,
    signal
  });
}

async function appendDevServerMarker(type, payload) {
  await mkdir(LOGS_DIRECTORY, { recursive: true });
  const dateStamp = new Date().toISOString().slice(0, 10);
  const logPath = resolve(LOGS_DIRECTORY, `server-starts-${dateStamp}.jsonl`);
  const record = {
    type,
    receivedAt: new Date().toISOString(),
    ...payload
  };
  await appendFile(logPath, `${JSON.stringify(record)}\n`, "utf8");
}

function createDevServerRunId() {
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
