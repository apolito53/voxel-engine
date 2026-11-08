import { TEST_GROUPS } from "./test_groups.mjs";

export function parseTestArguments(argv, groups = TEST_GROUPS) {
  const options = { groups: [], names: [], list: false, checkGroups: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--list") options.list = true;
    else if (argument === "--check-groups") options.checkGroups = true;
    else if (["--group", "--name", "--filter"].includes(argument)) {
      const value = argv[++index];
      if (typeof value !== "string" || !value.trim() || value.startsWith("--")) {
        throw new Error(`${argument} requires a nonempty value.`);
      }
      if (argument === "--group") {
        if (!Object.hasOwn(groups, value)) {
          throw new Error(`Unknown test group ${JSON.stringify(value)}. Available: ${Object.keys(groups).join(", ")}.`);
        }
        options.groups.push(value);
      } else options.names.push(value.toLowerCase());
    } else {
      throw new Error(`Unknown test option ${JSON.stringify(argument)}. Use --group, --name/--filter, --list, or --check-groups.`);
    }
  }
  return options;
}

export function checkTestGroups(tests, groups = TEST_GROUPS) {
  if (tests.length === 0) throw new Error("No registered engine tests.");
  const ownership = new Map();
  const counts = new Map(Object.keys(groups).map((group) => [group, 0]));
  for (const test of tests) {
    if (typeof test.name !== "string" || !test.name.trim()) throw new Error("Registered test names must be nonempty strings.");
    if (ownership.has(test.name)) throw new Error(`Duplicate registered test name: ${test.name}`);
    const normalizedName = test.name.toLowerCase();
    const owners = Object.entries(groups)
      .filter(([, { prefixes }]) => prefixes.some((prefix) => normalizedName.startsWith(prefix)))
      .map(([group]) => group);
    if (owners.length !== 1) {
      throw new Error(`${test.name}: expected one owning test group, found ${owners.length ? owners.join(", ") : "none"}. Update scripts/test_groups.mjs.`);
    }
    ownership.set(test.name, owners[0]);
    counts.set(owners[0], counts.get(owners[0]) + 1);
  }
  const empty = [...counts].filter(([, count]) => count === 0).map(([group]) => group);
  if (empty.length) throw new Error(`Empty test groups: ${empty.join(", ")}.`);
  return { ownership, counts };
}

export function selectTests(tests, argv, groups = TEST_GROUPS) {
  const options = parseTestArguments(argv, groups);
  const { ownership, counts } = checkTestGroups(tests, groups);
  for (const name of options.names) {
    if (!tests.some((test) => test.name.toLowerCase().includes(name))) {
      throw new Error(`No registered engine tests match name ${JSON.stringify(name)}.`);
    }
  }
  const selected = tests.filter((test) =>
    (!options.groups.length || options.groups.includes(ownership.get(test.name))) &&
    (!options.names.length || options.names.some((name) => test.name.toLowerCase().includes(name)))
  );
  if (!selected.length) throw new Error("No engine tests match the requested groups and names together.");
  return { options, selected, ownership, counts };
}

export async function runSelectedTests(tests, argv, groups = TEST_GROUPS, log = console.log) {
  const { options, selected, ownership, counts } = selectTests(tests, argv, groups);
  if (options.list || options.checkGroups) {
    log(`Group coverage: ${tests.length} registered tests across ${counts.size} nonempty groups.`);
    for (const [group, count] of counts) log(`  ${group}: ${count} — ${groups[group].description}`);
    log(`Selected ${selected.length}/${tests.length} engine robustness tests.`);
    if (options.list) {
      for (const { name } of selected) log(`[${ownership.get(name)}] ${name}`);
    }
    return;
  }

  log(`Running ${selected.length}/${tests.length} engine robustness tests.`);
  let passed = 0;
  for (const { name, run } of selected) {
    await run();
    passed += 1;
    log(`ok ${passed} - ${name}`);
  }
  log(`\n${passed}/${selected.length} engine robustness tests passed`);
}
