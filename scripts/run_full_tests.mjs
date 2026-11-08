import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.argv.length > 2) {
  console.error("npm test always runs the full gate and accepts no arguments. Use npm run test:focused -- --group <group> or --name <text> for selection.");
  process.exitCode = 1;
} else {
  const repoRoot = fileURLToPath(new URL("../", import.meta.url));
  const typecheck = fileURLToPath(new URL("../node_modules/typescript/bin/tsc", import.meta.url));
  for (const args of [
    [typecheck, "--noEmit"],
    ["scripts/check_source_hygiene.mjs"],
    ["--test", "tests/test_selection.test.mjs"],
    ["scripts/run_tests.mjs"],
    ["scripts/check_docs_links.mjs"]
  ]) {
    const result = spawnSync(process.execPath, args, { cwd: repoRoot, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1;
      break;
    }
  }
}
