#!/usr/bin/env python3
"""
Print a small TypeScript migration audit for the current source tree.

The output is intentionally practical: module sizes, dependency edges, and the
places where manual types will pay off first. It never writes files.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT / "src"

IMPORT_RE = re.compile(r"(?:import|export)\s+(?:[^'\"]+?\s+from\s+)?['\"](?P<path>\.{1,2}/[^'\"]+)['\"]")
CLASS_RE = re.compile(r"\bclass\s+(?P<name>[A-Za-z0-9_]+)")
FUNCTION_RE = re.compile(r"\bfunction\s+(?P<name>[A-Za-z0-9_]+)")
EXPORT_RE = re.compile(r"\bexport\s+(?:class|function|const|let|var)\s+(?P<name>[A-Za-z0-9_]+)")

HOTSPOTS = {
    "worker messages": ["postMessage", "onmessage", "Worker", "requestId"],
    "typed arrays": ["Uint8Array", "Float32Array", "Uint32Array", "ArrayBuffer"],
    "storage contracts": ["indexedDB", "IDB", "localStorage", "saveChunk", "loadChunk"],
    "world stats": ["getStats", "lastLoadedChunks", "dirtyChunks", "visibleChunks"],
    "raycast/collision shapes": ["voxelRaycast", "overlapsBlock", "normal", "block"],
}


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def source_files() -> list[Path]:
    return sorted([*SRC_DIR.rglob("*.js"), *SRC_DIR.rglob("*.ts")])


def normalize_import_path(specifier: str, owner: Path) -> str:
    if not specifier.startswith("."):
        return specifier

    resolved = (owner.parent / specifier).resolve()
    if resolved.suffix:
        return relative(resolved)

    for suffix in (".js", ".ts", ".css"):
        candidate = resolved.with_suffix(suffix)
        if candidate.exists():
            return relative(candidate)
    return relative(resolved)


def analyze_file(path: Path) -> dict[str, Any]:
    content = read_text(path)
    lines = content.splitlines()
    imports = [
        normalize_import_path(match.group("path"), path)
        for match in IMPORT_RE.finditer(content)
    ]
    hotspots = {
        label: [token for token in tokens if token in content]
        for label, tokens in HOTSPOTS.items()
    }
    hotspots = {label: tokens for label, tokens in hotspots.items() if tokens}

    return {
        "path": relative(path),
        "lines": len(lines),
        "imports": imports,
        "classes": CLASS_RE.findall(content),
        "functions": FUNCTION_RE.findall(content),
        "exports": EXPORT_RE.findall(content),
        "hotspots": hotspots,
    }


def migration_priority(module: dict[str, Any]) -> tuple[int, int]:
    path = module["path"]
    if path.endswith("voxelConstants.js") or path.endswith("voxelConstants.ts"):
        return (0, module["lines"])
    if path.endswith("blocks.js") or path.endswith("math.js") or path.endswith("terrain.js"):
        return (1, module["lines"])
    if "typed arrays" in module["hotspots"] or "storage contracts" in module["hotspots"]:
        return (2, module["lines"])
    if "worker messages" in module["hotspots"]:
        return (3, module["lines"])
    if path.endswith("world.js") or path.endswith("main.js"):
        return (5, module["lines"])
    return (4, module["lines"])


def build_audit() -> dict[str, Any]:
    modules = [analyze_file(path) for path in source_files()]
    modules_by_path = {module["path"]: module for module in modules}
    inbound_counts = {module["path"]: 0 for module in modules}

    for module in modules:
        for import_path in module["imports"]:
            if import_path in inbound_counts:
                inbound_counts[import_path] += 1

    for module in modules:
        module["inboundImports"] = inbound_counts[module["path"]]

    return {
        "root": str(ROOT),
        "moduleCount": len(modules),
        "modules": modules,
        "suggestedOrder": [
            module["path"]
            for module in sorted(modules, key=migration_priority)
        ],
        "manualTypeTargets": [
            "BlockId and block metadata records in src/blocks",
            "Worker generate/mesh request and response unions between src/world and src/chunkWorker",
            "ChunkStorage and WorldRegistry return shapes in src/chunkStorage",
            "Raycast hit shape in src/raycast",
            "VoxelWorld stats shape consumed by the debug HUD in src/main",
            "Quality preset records in src/main",
        ],
    }


def print_human(audit: dict[str, Any]) -> None:
    print("TypeScript migration audit")
    print(f"Root: {audit['root']}")
    print(f"Modules: {audit['moduleCount']}")
    print()
    print("Suggested conversion order:")
    for index, path in enumerate(audit["suggestedOrder"], start=1):
        print(f"  {index}. {path}")
    print()
    print("Manual type targets:")
    for target in audit["manualTypeTargets"]:
        print(f"  - {target}")
    print()
    print("Module hotspots:")
    for module in audit["modules"]:
        if not module["hotspots"]:
            continue
        labels = ", ".join(module["hotspots"].keys())
        print(f"  {module['path']}: {labels}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit source files before the TypeScript migration.")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable audit JSON.")
    args = parser.parse_args()

    audit = build_audit()
    if args.json:
        print(json.dumps(audit, indent=2))
    else:
        print_human(audit)


if __name__ == "__main__":
    main()
