import { existsSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT_MARKDOWN_FILES = ["README.md", "CODEBASE_INDEX.md", "CHANGELOG.md", "TODO.md"];
const DOCS_DIR = path.join(repoRoot, "docs");
const CODEBASE_INDEX_PATH = path.join(repoRoot, "CODEBASE_INDEX.md");
const CODEBASE_INDEX_MAX_BYTES = 30_000;
const CODEBASE_INDEX_MAX_LINE_LENGTH = 320;
const MARKDOWN_LINK_PATTERN = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const GENERATED_ANCHOR_PATTERN = /[^a-z0-9 -]/g;

const failures = [];

const markdownFiles = [
  ...ROOT_MARKDOWN_FILES.map((file) => path.join(repoRoot, file)),
  ...(await collectDocsMarkdownFiles())
];

for (const filePath of markdownFiles) {
  await checkMarkdownFile(filePath);
}

await checkCodebaseIndexHygiene();

if (failures.length > 0) {
  console.error("Markdown link check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Checked ${markdownFiles.length} Markdown files; all local links resolve.`);
}

async function collectDocsMarkdownFiles() {
  const entries = await readdir(DOCS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(DOCS_DIR, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

async function checkMarkdownFile(filePath) {
  if (!existsSync(filePath)) {
    failures.push(`${formatRelative(filePath)} is listed for docs checking but does not exist`);
    return;
  }

  const markdown = await readFile(filePath, "utf8");
  const anchors = buildAnchorSet(markdown);
  const lines = markdown.split(/\r?\n/);

  for (const match of markdown.matchAll(MARKDOWN_LINK_PATTERN)) {
    const target = match[1];
    if (shouldSkipTarget(target)) continue;

    const lineNumber = countLinesBeforeOffset(markdown, match.index ?? 0);
    checkLocalTarget({ filePath, target, anchors, lineNumber, lines });
  }
}

async function checkCodebaseIndexHygiene() {
  if (!existsSync(CODEBASE_INDEX_PATH)) return;

  const markdown = await readFile(CODEBASE_INDEX_PATH, "utf8");
  const byteLength = Buffer.byteLength(markdown, "utf8");
  if (byteLength > CODEBASE_INDEX_MAX_BYTES) {
    failures.push(
      `CODEBASE_INDEX.md is ${byteLength} bytes; keep the routing map below ` +
      `${CODEBASE_INDEX_MAX_BYTES} bytes and move deep contracts into docs/architecture.md`
    );
  }

  markdown.split(/\r?\n/).forEach((line, index) => {
    if (line.length <= CODEBASE_INDEX_MAX_LINE_LENGTH) return;
    failures.push(
      `CODEBASE_INDEX.md:${index + 1} is ${line.length} characters; ` +
      `wrap or simplify lines above ${CODEBASE_INDEX_MAX_LINE_LENGTH}`
    );
  });
}

function checkLocalTarget({ filePath, target, anchors, lineNumber, lines }) {
  const [rawPath = "", rawFragment = ""] = target.split("#");
  const decodedPath = decodeURIComponent(rawPath);
  const decodedFragment = decodeURIComponent(rawFragment);
  const targetFile = decodedPath
    ? path.resolve(path.dirname(filePath), decodedPath)
    : filePath;

  if (!targetFile.startsWith(repoRoot)) {
    failures.push(`${formatRelative(filePath)}:${lineNumber} points outside the repo: ${target}`);
    return;
  }

  if (!existsSync(targetFile)) {
    failures.push(`${formatRelative(filePath)}:${lineNumber} missing local target: ${target}`);
    return;
  }

  // Anchor checks catch renamed headings, but only for Markdown files where the
  // GitHub-style heading IDs are predictable enough to validate locally.
  if (decodedFragment && targetFile.endsWith(".md")) {
    const targetAnchors = targetFile === filePath
      ? anchors
      : buildAnchorSetFromFile(targetFile);
    if (!targetAnchors.has(decodedFragment.toLowerCase())) {
      failures.push(`${formatRelative(filePath)}:${lineNumber} missing heading anchor: ${target}`);
    }
  }

  // A very small courtesy for future maintainers: flag links that are likely to
  // have been split by line wrapping inside the URL instead of the link text.
  if (lines[lineNumber - 1]?.includes("](") && !lines[lineNumber - 1]?.includes(")")) {
    failures.push(`${formatRelative(filePath)}:${lineNumber} may contain a wrapped Markdown target`);
  }
}

function buildAnchorSet(markdown) {
  const anchors = new Set();
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (!heading) continue;
    anchors.add(toGithubAnchor(heading[2]));
  }
  return anchors;
}

function buildAnchorSetFromFile(filePath) {
  const markdown = existsSync(filePath)
    ? readFileSync(filePath, "utf8")
    : "";
  return buildAnchorSet(markdown);
}

function toGithubAnchor(headingText) {
  return headingText
    .trim()
    .toLowerCase()
    .replace(GENERATED_ANCHOR_PATTERN, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function shouldSkipTarget(target) {
  return (
    target.startsWith("http://") ||
    target.startsWith("https://") ||
    target.startsWith("mailto:") ||
    target.startsWith("tel:")
  );
}

function countLinesBeforeOffset(text, offset) {
  return text.slice(0, offset).split(/\r?\n/).length;
}

function formatRelative(filePath) {
  return path.relative(repoRoot, filePath).replaceAll(path.sep, "/");
}
