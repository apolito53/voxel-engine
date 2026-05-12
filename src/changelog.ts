export type ChangelogEntry = {
  readonly title: string;
  readonly version: string | null;
  readonly date: string | null;
  readonly body: string;
};

type ParsedVersion = {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
};

const CHANGELOG_ENTRY_HEADING = /^##\s+(.+?)\s*$/;
const RELEASE_HEADING = /^v?(\d+)\.(\d+)\.(\d+)(?:\s+-\s+(\d{4}-\d{2}-\d{2}))?$/;

export function parseChangelogEntries(markdown: string): ChangelogEntry[] {
  const normalizedMarkdown = markdown.replace(/\r\n/g, "\n");
  const entries: ChangelogEntry[] = [];
  let activeHeading: string | null = null;
  let activeBodyLines: string[] = [];

  for (const line of normalizedMarkdown.split("\n")) {
    const headingMatch = line.match(CHANGELOG_ENTRY_HEADING);
    if (headingMatch) {
      pushActiveEntry(entries, activeHeading, activeBodyLines);
      activeHeading = headingMatch[1] ?? "";
      activeBodyLines = [];
      continue;
    }

    if (activeHeading !== null) {
      activeBodyLines.push(line);
    }
  }

  pushActiveEntry(entries, activeHeading, activeBodyLines);
  return entries.sort(compareChangelogEntriesNewestFirst);
}

export function compareChangelogEntriesNewestFirst(left: ChangelogEntry, right: ChangelogEntry): number {
  const leftUnreleased = isUnreleasedEntry(left);
  const rightUnreleased = isUnreleasedEntry(right);
  if (leftUnreleased !== rightUnreleased) return leftUnreleased ? -1 : 1;

  const leftVersion = parseVersion(left.version);
  const rightVersion = parseVersion(right.version);
  if (leftVersion && rightVersion) {
    return compareVersionPartsNewestFirst(leftVersion, rightVersion);
  }
  if (leftVersion !== rightVersion) return leftVersion ? -1 : 1;

  const dateComparison = (right.date ?? "").localeCompare(left.date ?? "");
  if (dateComparison !== 0) return dateComparison;

  return left.title.localeCompare(right.title);
}

function pushActiveEntry(entries: ChangelogEntry[], heading: string | null, bodyLines: readonly string[]): void {
  if (heading === null) return;
  const trimmedBody = trimBlankLines(bodyLines).join("\n");
  if (trimmedBody.length === 0) return;

  const releaseMatch = heading.match(RELEASE_HEADING);
  const version = releaseMatch
    ? `${releaseMatch[1]}.${releaseMatch[2]}.${releaseMatch[3]}`
    : null;
  entries.push({
    title: releaseMatch ? version ?? heading : heading,
    version,
    date: releaseMatch?.[4] ?? null,
    body: trimmedBody
  });
}

function trimBlankLines(lines: readonly string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]?.trim() === "") start += 1;
  while (end > start && lines[end - 1]?.trim() === "") end -= 1;
  return lines.slice(start, end);
}

function isUnreleasedEntry(entry: ChangelogEntry): boolean {
  return isUnreleasedTitle(entry.title);
}

function isUnreleasedTitle(title: string): boolean {
  return title.trim().toLowerCase() === "unreleased";
}

function parseVersion(version: string | null): ParsedVersion | null {
  if (!version) return null;
  const parts = version.split(".").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return null;
  return {
    major: parts[0] ?? 0,
    minor: parts[1] ?? 0,
    patch: parts[2] ?? 0
  };
}

function compareVersionPartsNewestFirst(left: ParsedVersion, right: ParsedVersion): number {
  if (left.major !== right.major) return right.major - left.major;
  if (left.minor !== right.minor) return right.minor - left.minor;
  return right.patch - left.patch;
}
