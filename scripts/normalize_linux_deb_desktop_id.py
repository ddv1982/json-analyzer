#!/usr/bin/env python3
"""Normalize JSON Analyzer Debian packages to the reverse-DNS desktop-id contract."""

from __future__ import annotations

import argparse
import glob
import pathlib
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET


COMPONENT_ID = "com.jsonanalyzer.desktop"
SOURCE_DESKTOP_ID = "JSON Analyzer.desktop"
TARGET_DESKTOP_ID = "com.jsonanalyzer.desktop.desktop"
ROOT = pathlib.Path(__file__).resolve().parent.parent
CANONICAL_DESKTOP = ROOT / "src-tauri/linux" / TARGET_DESKTOP_ID


def strip_ns(name: str) -> str:
    return name.rsplit("}", 1)[-1]


def rewrite_launchable(path: pathlib.Path) -> None:
    tree = ET.parse(path)
    root = tree.getroot()
    for element in root.iter():
        if strip_ns(element.tag) == "launchable" and element.attrib.get("type") == "desktop-id":
            element.text = TARGET_DESKTOP_ID
            ET.indent(tree, space="  ")
            tree.write(path, encoding="utf-8", xml_declaration=True)
            return
    raise RuntimeError(f"{path} has no launchable type=\"desktop-id\" element")


def normalize_package(package_path: pathlib.Path) -> list[str]:
    dpkg_deb = shutil.which("dpkg-deb")
    if not dpkg_deb:
        raise RuntimeError("dpkg-deb was not found; install dpkg before normalizing .deb files")

    changes: list[str] = []
    with tempfile.TemporaryDirectory(prefix="json-analyzer-deb-normalize-") as temp:
        temp_path = pathlib.Path(temp)
        data_dir = temp_path / "data"
        control_dir = temp_path / "control"
        data_dir.mkdir()
        control_dir.mkdir()

        subprocess.run([dpkg_deb, "-x", str(package_path), str(data_dir)], check=True)
        subprocess.run([dpkg_deb, "-e", str(package_path), str(control_dir)], check=True)
        shutil.copytree(control_dir, data_dir / "DEBIAN")

        source_desktop = data_dir / "usr/share/applications" / SOURCE_DESKTOP_ID
        target_desktop = data_dir / "usr/share/applications" / TARGET_DESKTOP_ID
        if source_desktop.exists():
            target_desktop.parent.mkdir(parents=True, exist_ok=True)
            if target_desktop.exists():
                target_desktop.unlink()
            source_desktop.rename(target_desktop)
            changes.append(f"renamed {SOURCE_DESKTOP_ID} to {TARGET_DESKTOP_ID}")
        elif target_desktop.exists():
            changes.append(f"kept existing {TARGET_DESKTOP_ID}")
        else:
            raise RuntimeError(
                f"{package_path} contains neither {SOURCE_DESKTOP_ID} nor {TARGET_DESKTOP_ID}"
            )

        if not CANONICAL_DESKTOP.is_file():
            raise RuntimeError(f"canonical desktop file is missing: {CANONICAL_DESKTOP}")
        shutil.copy2(CANONICAL_DESKTOP, target_desktop)
        changes.append("replaced desktop file with canonical project metadata")

        metainfo = data_dir / "usr/share/metainfo" / f"{COMPONENT_ID}.metainfo.xml"
        if not metainfo.exists():
            raise RuntimeError(f"{package_path} is missing {metainfo.relative_to(data_dir)}")
        rewrite_launchable(metainfo)
        changes.append("rewrote AppStream launchable desktop id")

        rebuilt = temp_path / package_path.name
        subprocess.run([dpkg_deb, "-b", str(data_dir), str(rebuilt)], check=True)
        shutil.copy2(rebuilt, package_path)

    return changes


def expand_packages(patterns: list[str]) -> list[pathlib.Path]:
    packages: list[pathlib.Path] = []
    for pattern in patterns:
        matches = [pathlib.Path(match) for match in glob.glob(pattern, recursive=True)]
        if matches:
            packages.extend(matches)
        else:
            packages.append(pathlib.Path(pattern))
    return sorted(set(packages))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("packages", nargs="+")
    args = parser.parse_args()

    packages = expand_packages(args.packages)
    if not packages:
        raise SystemExit("no Debian packages matched")

    for package in packages:
        if not package.is_file():
            raise SystemExit(f"Debian package not found: {package}")
        changes = normalize_package(package)
        print(f"Normalized {package}: {', '.join(changes)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
