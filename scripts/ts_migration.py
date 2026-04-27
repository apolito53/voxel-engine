#!/usr/bin/env python3
"""
Mechanical TypeScript migration helper for the voxel sandbox engine.

This script deliberately handles only the boring, reversible pieces:
- rename source modules from .js to .ts
- update local import specifiers and the worker URL
- point index.html at src/main.ts
- add a loose tsconfig.json and a package.json typecheck script

It does not invent useful domain types. That manual pass is where the migration
actually becomes valuable.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT / "src"
MANIFEST_PATH = ROOT / ".ts-migration-manifest.json"
TYPESCRIPT_VERSION = "^5.8.3"

WORKER_URL_RE = re.compile(
    r"(?P<prefix>new\s+URL\(\s*['\"])(?P<path>\.{1,2}/[^'\"]+)\.js(?P<suffix>['\"])",
    re.MULTILINE,
)
RELATIVE_JS_SPECIFIER_RE = re.compile(
    r"(?P<quote>['\"])(?P<path>\.{1,2}/[^'\"]+)\.js(?P=quote)",
    re.MULTILINE,
)

TSCONFIG_TEMPLATE: dict[str, Any] = {
    "compilerOptions": {
        "target": "ES2022",
        "useDefineForClassFields": True,
        "module": "ESNext",
        "lib": ["ES2022", "DOM", "DOM.Iterable", "WebWorker"],
        "allowJs": False,
        "checkJs": False,
        "moduleResolution": "Bundler",
        "resolveJsonModule": True,
        "isolatedModules": True,
        "noEmit": True,
        "strict": False,
        "noImplicitAny": False,
        "skipLibCheck": True,
    },
    "include": ["src/**/*.ts"],
}


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8", newline="\n")


def file_hash(path: Path) -> str | None:
    if not path.exists():
        return None
    return hashlib.sha256(path.read_bytes()).hexdigest()


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def source_js_files() -> list[Path]:
    return sorted(SRC_DIR.rglob("*.js"))


def rewrite_module_specifiers(content: str) -> str:
    """Rewrite source references after .js files become .ts files."""

    # Worker construction benefits from keeping the concrete .ts extension so
    # Vite can resolve the worker entry without guessing.
    content = WORKER_URL_RE.sub(
        lambda match: f"{match.group('prefix')}{match.group('path')}.ts{match.group('suffix')}",
        content,
    )

    # Normal local imports become extensionless so TypeScript and Vite both
    # resolve them without needing allowImportingTsExtensions.
    return RELATIVE_JS_SPECIFIER_RE.sub(
        lambda match: f"{match.group('quote')}{match.group('path')}{match.group('quote')}",
        content,
    )


def rewrite_index_html(content: str) -> str:
    return content.replace("/src/main.js", "/src/main.ts")


def patch_package_json(content: str, typescript_version: str) -> str:
    package = json.loads(content)
    scripts = package.setdefault("scripts", {})
    scripts.setdefault("typecheck", "tsc --noEmit")

    dev_dependencies = package.setdefault("devDependencies", {})
    dev_dependencies.setdefault("typescript", typescript_version)

    return json.dumps(package, indent=2) + "\n"


def tsconfig_content() -> str:
    return json.dumps(TSCONFIG_TEMPLATE, indent=2) + "\n"


def planned_renames() -> list[dict[str, str]]:
    renames = []
    for source in source_js_files():
        target = source.with_suffix(".ts")
        renames.append({"from": relative(source), "to": relative(target)})
    return renames


def planned_text_updates() -> list[str]:
    paths: set[Path] = set(source_js_files())
    paths.add(ROOT / "index.html")
    paths.add(ROOT / "package.json")
    return [relative(path) for path in sorted(paths)]


def build_plan(typescript_version: str) -> dict[str, Any]:
    return {
        "root": str(ROOT),
        "manifest": relative(MANIFEST_PATH),
        "typescriptVersion": typescript_version,
        "renames": planned_renames(),
        "textUpdates": planned_text_updates(),
        "creates": ["tsconfig.json"] if not (ROOT / "tsconfig.json").exists() else [],
        "manualAfterApply": [
            "Run npm.cmd install so package-lock.json records TypeScript.",
            "Run npm.cmd run typecheck and fix type errors from small modules outward.",
            "Run npm.cmd run build after typecheck passes.",
            "Start with shared data contracts: blocks, constants, worker messages, chunk storage, raycast hits, world stats.",
        ],
    }


def print_plan(plan: dict[str, Any], as_json: bool) -> None:
    if as_json:
        print(json.dumps(plan, indent=2))
        return

    print("TypeScript migration plan")
    print(f"Root: {plan['root']}")
    print(f"Manifest: {plan['manifest']}")
    print()
    print("Renames:")
    for rename in plan["renames"]:
        print(f"  {rename['from']} -> {rename['to']}")
    print()
    print("Text updates:")
    for path in plan["textUpdates"]:
        print(f"  {path}")
    if plan["creates"]:
        print()
        print("Creates:")
        for path in plan["creates"]:
            print(f"  {path}")
    print()
    print("After apply:")
    for item in plan["manualAfterApply"]:
        print(f"  - {item}")


def snapshot(path: Path) -> dict[str, Any]:
    return {
        "path": relative(path),
        "exists": path.exists(),
        "sha256": file_hash(path),
        "content": read_text(path) if path.exists() else None,
    }


def guard_apply(plan: dict[str, Any], force: bool) -> None:
    if MANIFEST_PATH.exists() and not force:
        raise SystemExit(
            f"{relative(MANIFEST_PATH)} already exists. "
            "Run rollback first or pass --force if you know this is safe."
        )

    for rename in plan["renames"]:
        source = ROOT / rename["from"]
        target = ROOT / rename["to"]
        if not source.exists():
            raise SystemExit(f"Expected source file is missing: {rename['from']}")
        if target.exists() and not force:
            raise SystemExit(f"Target already exists: {rename['to']}")


def apply_migration(args: argparse.Namespace) -> None:
    plan = build_plan(args.typescript_version)
    guard_apply(plan, args.force)

    manifest = {
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "plan": plan,
        "snapshots": [
            snapshot(ROOT / "index.html"),
            snapshot(ROOT / "package.json"),
            snapshot(ROOT / "tsconfig.json"),
        ],
    }

    # Rewrite source imports before renaming the files so rollback can restore
    # from git or the manifest without having to infer old names.
    for source in source_js_files():
        write_text(source, rewrite_module_specifiers(read_text(source)))

    write_text(ROOT / "index.html", rewrite_index_html(read_text(ROOT / "index.html")))
    write_text(ROOT / "package.json", patch_package_json(read_text(ROOT / "package.json"), args.typescript_version))

    tsconfig = ROOT / "tsconfig.json"
    if not tsconfig.exists() or args.force:
        write_text(tsconfig, tsconfig_content())

    for rename in plan["renames"]:
        source = ROOT / rename["from"]
        target = ROOT / rename["to"]
        source.rename(target)

    write_text(MANIFEST_PATH, json.dumps(manifest, indent=2) + "\n")
    print(f"Applied mechanical migration. Manifest written to {relative(MANIFEST_PATH)}")


def restore_snapshot(entry: dict[str, Any]) -> None:
    path = ROOT / entry["path"]
    if entry["exists"]:
        write_text(path, entry["content"])
    elif path.exists():
        path.unlink()


def rollback_migration(args: argparse.Namespace) -> None:
    if not MANIFEST_PATH.exists():
        raise SystemExit(f"No manifest found at {relative(MANIFEST_PATH)}")
    if not args.force:
        raise SystemExit("Rollback overwrites migrated files. Re-run with --force when you mean it.")

    manifest = json.loads(read_text(MANIFEST_PATH))
    renames = list(reversed(manifest["plan"]["renames"]))

    for rename in renames:
        source = ROOT / rename["to"]
        target = ROOT / rename["from"]
        if source.exists():
            source.rename(target)

    for entry in manifest["snapshots"]:
        restore_snapshot(entry)

    MANIFEST_PATH.unlink()
    print("Rolled back mechanical TypeScript migration.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare or apply the mechanical TypeScript migration.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    plan_parser = subparsers.add_parser("plan", help="Print the migration plan without changing files.")
    plan_parser.add_argument("--json", action="store_true", help="Emit the plan as JSON.")
    plan_parser.add_argument("--typescript-version", default=TYPESCRIPT_VERSION)

    apply_parser = subparsers.add_parser("apply", help="Apply the mechanical migration.")
    apply_parser.add_argument("--force", action="store_true", help="Allow overwriting generated migration artifacts.")
    apply_parser.add_argument("--typescript-version", default=TYPESCRIPT_VERSION)

    rollback_parser = subparsers.add_parser("rollback", help="Undo the mechanical migration from the manifest.")
    rollback_parser.add_argument("--force", action="store_true", help="Required because rollback overwrites files.")

    args = parser.parse_args()

    if args.command == "plan":
        print_plan(build_plan(args.typescript_version), args.json)
    elif args.command == "apply":
        apply_migration(args)
    elif args.command == "rollback":
        rollback_migration(args)


if __name__ == "__main__":
    main()
