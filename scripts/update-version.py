#!/usr/bin/env python3
"""更新 KeFeng Toolkits 的应用版本号。

同步更新：
  - package.json
  - package-lock.json（根版本与 packages[""].version，不改依赖版本）
  - src-tauri/Cargo.toml
  - src-tauri/Cargo.lock（仅当前 crate）
  - src-tauri/tauri.conf.json
  - index.html 侧边栏页脚

用法：
    python scripts/update-version.py 1.1.0
    python scripts/update-version.py v1.1.0 --dry-run
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


@dataclass
class Update:
    label: str
    pattern: re.Pattern[str]
    prefix: str = ""


@dataclass
class Target:
    path: str
    updates: list[Update] = field(default_factory=list)


@dataclass
class Change:
    path: str
    label: str
    old: str
    new: str


@dataclass
class FileResult:
    path: Path
    original: str
    updated: str
    changes: list[Change]


def normalize_version(raw: str) -> str:
    version = raw.strip()
    if version[:1].lower() == "v":
        version = version[1:]
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise SystemExit(
            f"版本号必须为 x.y.z 格式，例如 1.1.0（收到：{raw}）"
        )
    return version


def read_text(path: Path) -> str:
    with path.open("r", encoding="utf-8", newline="") as handle:
        return handle.read()


def write_text(path: Path, text: str) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        handle.write(text)


def cargo_package_name(cargo_toml: str) -> str:
    match = re.search(
        r"(?ms)^\[package\][^\[]*?^name\s*=\s*\"([^\"]+)\"",
        cargo_toml,
    )
    if not match:
        raise SystemExit("无法从 src-tauri/Cargo.toml 读取 [package] name")
    return match.group(1)


def build_targets(package_name: str) -> list[Target]:
    json_version = re.compile(r'(?m)^(\s*"version"\s*:\s*")([^"]+)(")')
    lock_packages_version = re.compile(
        r'(?ms)("packages"\s*:\s*\{\s*""\s*:\s*\{.*?"version"\s*:\s*")([^"]+)(")'
    )
    cargo_toml_version = re.compile(
        r'(?ms)^(\[package\]\s*\r?\n.*?^version\s*=\s*")([^"]+)(")'
    )
    cargo_lock_version = re.compile(
        r'(?ms)^(\[\[package\]\]\s*\r?\nname\s*=\s*"'
        + re.escape(package_name)
        + r'"\s*\r?\nversion\s*=\s*")([^"]+)(")'
    )
    footer_version = re.compile(
        r'(<div class="sidebar__footer">\s*)v([0-9]+\.[0-9]+\.[0-9]+)(\s*</div>)'
    )

    return [
        Target("package.json", [Update("version", json_version)]),
        Target(
            "package-lock.json",
            [
                Update("root version", json_version),
                Update('packages[""] version', lock_packages_version),
            ],
        ),
        Target(
            "src-tauri/Cargo.toml",
            [Update("[package] version", cargo_toml_version)],
        ),
        Target(
            "src-tauri/Cargo.lock",
            [Update(f"{package_name} package version", cargo_lock_version)],
        ),
        Target("src-tauri/tauri.conf.json", [Update("version", json_version)]),
        Target("index.html", [Update("sidebar footer", footer_version, "v")]),
    ]


def main() -> int:
    parser = argparse.ArgumentParser(
        description="更新 KeFeng Toolkits 的应用版本号"
    )
    parser.add_argument("version", help="新版本号，例如 1.1.0 或 v1.1.0")
    parser.add_argument(
        "-n",
        "--dry-run",
        action="store_true",
        help="只显示将要修改的内容，不写入文件",
    )
    args = parser.parse_args()

    version = normalize_version(args.version)
    cargo_path = REPO_ROOT / "src-tauri" / "Cargo.toml"
    if not cargo_path.is_file():
        raise SystemExit(f"文件不存在：{cargo_path}")
    package_name = cargo_package_name(read_text(cargo_path))
    targets = build_targets(package_name)

    # 先在内存中完成全部匹配和替换，避免某个文件失败时只更新一半。
    results: list[FileResult] = []
    for target in targets:
        path = REPO_ROOT / target.path
        if not path.is_file():
            raise SystemExit(f"文件不存在：{target.path}")

        original = read_text(path)
        text = original
        changes: list[Change] = []

        for update in target.updates:
            match = update.pattern.search(text)
            if not match:
                raise SystemExit(f"在 {target.path} 中未找到 {update.label}")

            old_version = match.group(2)
            replacement = r"\g<1>" + update.prefix + version + r"\g<3>"
            text = update.pattern.sub(replacement, text, count=1)
            changes.append(
                Change(
                    path=target.path,
                    label=update.label,
                    old=update.prefix + old_version,
                    new=update.prefix + version,
                )
            )

        results.append(FileResult(path, original, text, changes))

    total_changes = 0
    for result in results:
        for change in result.changes:
            total_changes += 1
            state = " (already set)" if change.old == change.new else ""
            print(
                f"  {change.path} [{change.label}]: "
                f"{change.old} -> {change.new}{state}"
            )

    if args.dry_run:
        print()
        print("Dry run: no files were written.")
        return 0

    written_files = 0
    for result in results:
        if result.original != result.updated:
            write_text(result.path, result.updated)
            written_files += 1

    print()
    print(
        f"Version {version} applied: "
        f"{written_files} file(s), {total_changes} occurrence(s)."
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
