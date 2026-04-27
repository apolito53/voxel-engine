import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const outdir = ".test-dist";
const outfile = `${outdir}/run.mjs`;

await mkdir(outdir, { recursive: true });

// Bundle the TypeScript test entry so Node can run the browser-oriented
// extensionless imports without adding another test framework dependency yet.
await build({
  entryPoints: ["tests/run.ts"],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "es2022",
  sourcemap: "inline",
  logLevel: "silent"
});

await import(pathToFileURL(outfile).href);
