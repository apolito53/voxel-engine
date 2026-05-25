import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(repoRoot, "src");

const bannedPatterns = [
  {
    label: "@ts-nocheck",
    pattern: /@ts-nocheck/
  },
  {
    label: "@ts-ignore",
    pattern: /@ts-ignore/
  },
  {
    label: "explicit any annotation",
    pattern: /(?::|\?)\s*any\b/
  },
  {
    label: "explicit any assertion",
    pattern: /\bas\s+any\b|<\s*any\s*>/
  },
  {
    label: "explicit any generic",
    pattern: /\b(?:Array|ReadonlyArray|Promise|Record|Map|Set)\s*<[^>\n]*\bany\b/
  }
];

const failures = [];
const sourceFiles = await collectSourceFiles(sourceRoot);

for (const filePath of sourceFiles) {
  await checkSourceFile(filePath);
}

if (failures.length > 0) {
  console.error("Source hygiene check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Checked ${sourceFiles.length} source files; no banned TypeScript escape hatches found.`);
}

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectSourceFiles(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(entryPath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

async function checkSourceFile(filePath) {
  const source = await readFile(filePath, "utf8");
  const lines = source.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (isCommentOnlyLine(line)) return;

    for (const bannedPattern of bannedPatterns) {
      if (!bannedPattern.pattern.test(line)) continue;
      failures.push(`${formatRelative(filePath)}:${index + 1} ${bannedPattern.label}`);
    }
  });
}

function isCommentOnlyLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith("//") || trimmed.startsWith("*");
}

function formatRelative(filePath) {
  return path.relative(repoRoot, filePath).replaceAll(path.sep, "/");
}
