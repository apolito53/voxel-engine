import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { checkTestGroups, runSelectedTests, selectTests } from "../scripts/test_selection.mjs";

const groups = {
  world: { description: "World contracts", prefixes: ["world "] },
  lighting: { description: "Light contracts", prefixes: ["light "] }
};
const names = ["world chunks", "world saves [v1]", "light lamps"];
const cases = names.map((name) => ({ name, run() { throw new Error("Selection must not execute test bodies"); } }));
const repoRoot = fileURLToPath(new URL("../", import.meta.url));

test("no arguments execute every registered test once in registration order", async () => {
  const ran = [];
  const messages = [];
  await runSelectedTests(names.map((name) => ({ name, async run() { await Promise.resolve(); ran.push(name); } })), [], groups, (message) => messages.push(message));
  assert.deepEqual(ran, names);
  assert.equal(messages.at(-1), "\n3/3 engine robustness tests passed");
});

test("repeated groups and names form deduplicated unions, with names refining groups", () => {
  const selection = selectTests(cases, [
    "--group", "world", "--group", "lighting", "--group", "world",
    "--name", "WORLD", "--filter", "lamps", "--name", "chunks"
  ], groups);
  assert.deepEqual(selection.selected, cases);
  assert.deepEqual(selectTests(cases, ["--name", "[v1]"], groups).selected, [cases[1]], "names are literal substrings, not regexes");
  assert.deepEqual(selectTests(cases, ["--group", "world", "--name", "chunks", "--name", "lamps"], groups).selected, [cases[0]]);
  assert.throws(() => selectTests(cases, ["--group", "lighting", "--name", "world"], groups), /groups and names together/);
});

test("invalid, empty, or partially invalid selectors fail before any body can run", async () => {
  for (const argv of [
    ["--bogus"], ["world"], ["--group"], ["--name"], ["--filter"],
    ["--group", ""], ["--name", " "], ["--filter", ""], ["--name", "--list"],
    ["--group", "missing"], ["--name", "missing"],
    ["--group", "world", "--group", "missing"],
    ["--name", "world", "--filter", "missing"],
    ["--list", "--group", "missing"], ["--check-groups", "--bogus"]
  ]) {
    await assert.rejects(runSelectedTests(cases, argv, groups, () => {}), /Unknown|requires a nonempty value|No registered engine tests match/, JSON.stringify(argv));
  }
});

test("group coverage rejects missing, ambiguous, duplicate, and empty registrations", () => {
  assert.deepEqual([...checkTestGroups(cases, groups).counts], [["world", 2], ["lighting", 1]]);
  assert.throws(() => checkTestGroups([...cases, { name: "new system", run() {} }], groups), /found none/);
  assert.throws(() => checkTestGroups(cases, { ...groups, duplicate: { description: "Wrong owner", prefixes: ["world "] } }), /found world, duplicate/);
  assert.throws(() => checkTestGroups(cases.slice(0, 2), groups), /Empty test groups: lighting/);
  assert.throws(() => checkTestGroups([...cases, cases[0]], groups), /Duplicate registered test name/);
  assert.throws(() => checkTestGroups([], groups), /No registered engine tests/);
});

test("list and coverage modes validate the complete registry without executing bodies", async () => {
  const listed = [];
  await runSelectedTests(cases, ["--group", "world", "--list"], groups, (message) => listed.push(message));
  assert.ok(listed.includes("Group coverage: 3 registered tests across 2 nonempty groups."));
  assert.ok(listed.includes("Selected 2/3 engine robustness tests."));
  assert.deepEqual(listed.filter((line) => line.startsWith("[")), ["[world] world chunks", "[world] world saves [v1]"]);
  const checked = [];
  await runSelectedTests(cases, ["--group", "lighting", "--check-groups"], groups, (message) => checked.push(message));
  assert.ok(checked.includes("Selected 1/3 engine robustness tests."));
  assert.equal(checked.some((line) => line.startsWith("[")), false);
  await assert.rejects(runSelectedTests(cases.slice(0, 2), ["--group", "world", "--list"], groups, () => {}), /Empty test groups: lighting/);
});

function runScript(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: repoRoot, encoding: "utf8" });
  assert.ifError(result.error);
  return { ...result, output: result.stdout + result.stderr };
}

test("the full npm-test entry rejects selection arguments before running its checks", () => {
  const result = runScript("scripts/run_full_tests.mjs", ["--group", "menus"]);
  assert.equal(result.status, 1);
  assert.match(result.output, /npm test always runs the full gate.*npm run test:focused/);
  assert.doesNotMatch(result.output, /engine robustness tests passed|source files/);
});

test("the actual focused entry lists selected engine names and rejects unmatched arguments", () => {
  const result = runScript("scripts/run_tests.mjs", ["--group", "menus", "--name", "pause menu", "--list"]);
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /\[menus\] pause menu keeps settings and debug controls in their labeled panels/);
  assert.match(result.output, /Selected 1\/\d+ engine robustness tests/);
  assert.doesNotMatch(result.output, /ok 1 -|tests passed/);

  for (const args of [["--bogus"], ["--name", "__unmatched_voxel_selector__"], ["--group", "menus", "--name", "rigid debris"]]) {
    const invalid = runScript("scripts/run_tests.mjs", args);
    assert.equal(invalid.status, 1, invalid.output);
    assert.match(invalid.output, /Unknown test option|No registered engine tests match|groups and names together/);
    assert.doesNotMatch(invalid.output, /ok 1 -|tests passed/);
  }
});
