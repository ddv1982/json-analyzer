#!/usr/bin/env python3
"""Validate JSON Analyzer Linux package metadata for desktop software centers."""

from __future__ import annotations

import argparse
import glob
import json
import pathlib
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import Any


COMPONENT_ID = "com.jsonanalyzer.desktop"
DESKTOP_ID = "com.jsonanalyzer.desktop.desktop"
PROJECT_LICENSE = "MIT"
BINARY = "json-analyzer-app"
DEB_COPYRIGHT_PATH = pathlib.PurePosixPath("usr/share/doc/json-analyzer/copyright")
RPM_LICENSE_PATH = pathlib.PurePosixPath("usr/share/licenses/json-analyzer/LICENSE")
ICON_PATHS = [
    pathlib.PurePosixPath("usr/share/icons/hicolor/32x32/apps/json-analyzer.png"),
    pathlib.PurePosixPath("usr/share/icons/hicolor/128x128/apps/json-analyzer.png"),
    pathlib.PurePosixPath("usr/share/icons/hicolor/256x256/apps/json-analyzer.png"),
    pathlib.PurePosixPath("usr/share/icons/hicolor/512x512/apps/json-analyzer.png"),
]


@dataclass
class PackageReport:
    package: str
    package_format: str
    ok: bool = False
    metainfo_path: str | None = None
    desktop_path: str | None = None
    license_path: str | None = None
    component_id: str | None = None
    metadata_license: str | None = None
    project_license: str | None = None
    launchable: str | None = None
    binary: str | None = None
    release_version: str | None = None
    desktop_fields: dict[str, str] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)

    def to_json(self) -> dict[str, Any]:
        return {
            "package": self.package,
            "package_format": self.package_format,
            "ok": self.ok,
            "metainfo_path": self.metainfo_path,
            "desktop_path": self.desktop_path,
            "license_path": self.license_path,
            "component_id": self.component_id,
            "metadata_license": self.metadata_license,
            "project_license": self.project_license,
            "launchable": self.launchable,
            "binary": self.binary,
            "release_version": self.release_version,
            "desktop_fields": self.desktop_fields,
            "errors": self.errors,
        }


def strip_ns(name: str) -> str:
    return name.rsplit("}", 1)[-1]


def child_text(element: ET.Element, tag_name: str) -> str | None:
    for child in element:
        if strip_ns(child.tag) == tag_name and child.text:
            return child.text.strip()
    return None


def descendant_text(element: ET.Element, tag_name: str) -> str | None:
    for child in element.iter():
        if strip_ns(child.tag) == tag_name and child.text:
            return child.text.strip()
    return None


def launchable_desktop_id(element: ET.Element) -> str | None:
    for child in element.iter():
        if strip_ns(child.tag) == "launchable" and child.attrib.get("type") == "desktop-id":
            return (child.text or "").strip() or None
    return None


def first_release_version(element: ET.Element) -> str | None:
    for child in element.iter():
        if strip_ns(child.tag) == "release":
            return child.attrib.get("version")
    return None


def run_tool(command: list[str], errors: list[str]) -> None:
    if not shutil.which(command[0]):
        errors.append(f"missing validation tool: {command[0]}")
        return
    completed = subprocess.run(command, check=False, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout).strip()
        errors.append(f"{' '.join(command)} failed: {detail}")


def extract_deb(package: pathlib.Path, destination: pathlib.Path) -> None:
    dpkg_deb = shutil.which("dpkg-deb")
    if not dpkg_deb:
        raise RuntimeError("dpkg-deb was not found")
    subprocess.run([dpkg_deb, "-x", str(package), str(destination)], check=True)


def extract_rpm(package: pathlib.Path, destination: pathlib.Path) -> None:
    rpm2cpio = shutil.which("rpm2cpio")
    cpio = shutil.which("cpio")
    if not rpm2cpio or not cpio:
        raise RuntimeError("rpm2cpio and cpio are required to inspect RPM contents")

    rpm = subprocess.run([rpm2cpio, str(package)], check=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if rpm.returncode != 0:
        raise RuntimeError(rpm.stderr.decode("utf-8", errors="replace").strip())

    cpio_result = subprocess.run(
        [cpio, "-idm", "--quiet"],
        cwd=destination,
        input=rpm.stdout,
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if cpio_result.returncode != 0:
        raise RuntimeError(cpio_result.stderr.decode("utf-8", errors="replace").strip())


def parse_desktop_file(path: pathlib.Path) -> dict[str, str]:
    fields: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("[") or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        fields[key] = value
    return fields


def validate_extracted(package: pathlib.Path, package_format: str, root: pathlib.Path) -> PackageReport:
    report = PackageReport(package=str(package), package_format=package_format)
    metainfo = root / "usr/share/metainfo" / f"{COMPONENT_ID}.metainfo.xml"
    desktop = root / "usr/share/applications" / DESKTOP_ID
    license_path = root / (DEB_COPYRIGHT_PATH if package_format == "deb" else RPM_LICENSE_PATH)

    report.metainfo_path = str(metainfo.relative_to(root))
    report.desktop_path = str(desktop.relative_to(root))
    report.license_path = str(license_path.relative_to(root))

    required_paths = [metainfo, desktop, license_path]
    required_paths.extend(root / icon_path for icon_path in ICON_PATHS)
    for required in required_paths:
        if not required.exists():
            report.errors.append(f"missing required package file: {required.relative_to(root)}")

    if metainfo.exists():
        try:
            appstream_root = ET.parse(metainfo).getroot()
            report.component_id = child_text(appstream_root, "id")
            report.metadata_license = child_text(appstream_root, "metadata_license")
            report.project_license = child_text(appstream_root, "project_license")
            report.launchable = launchable_desktop_id(appstream_root)
            report.binary = descendant_text(appstream_root, "binary")
            report.release_version = first_release_version(appstream_root)
        except ET.ParseError as error:
            report.errors.append(f"could not parse AppStream metainfo: {error}")

        run_tool(["appstreamcli", "validate", "--no-net", str(metainfo)], report.errors)

    if desktop.exists():
        report.desktop_fields = parse_desktop_file(desktop)
        run_tool(["desktop-file-validate", str(desktop)], report.errors)

    expected_values = {
        "component id": (report.component_id, COMPONENT_ID),
        "metadata license": (report.metadata_license, PROJECT_LICENSE),
        "project license": (report.project_license, PROJECT_LICENSE),
        "launchable desktop id": (report.launchable, DESKTOP_ID),
        "provided binary": (report.binary, BINARY),
        "desktop Name": (report.desktop_fields.get("Name"), "JSON Analyzer"),
        "desktop Exec": (report.desktop_fields.get("Exec"), BINARY),
        "desktop Icon": (report.desktop_fields.get("Icon"), "json-analyzer"),
        "desktop Type": (report.desktop_fields.get("Type"), "Application"),
    }
    for label, (actual, expected) in expected_values.items():
        if actual != expected:
            report.errors.append(f"unexpected {label}: expected {expected!r}, got {actual!r}")

    if not report.release_version:
        report.errors.append("AppStream metainfo has no release version")

    report.ok = not report.errors
    return report


def validate_package(package: pathlib.Path) -> PackageReport:
    if package.suffix == ".deb":
        package_format = "deb"
    elif package.suffix == ".rpm":
        package_format = "rpm"
    else:
        raise RuntimeError(f"unsupported package format: {package}")

    with tempfile.TemporaryDirectory(prefix="json-analyzer-package-validate-") as temp:
        root = pathlib.Path(temp)
        if package_format == "deb":
            extract_deb(package, root)
        else:
            extract_rpm(package, root)
        return validate_extracted(package, package_format, root)


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
    parser.add_argument("--json-report", default="")
    args = parser.parse_args()

    packages = expand_packages(args.packages)
    if not packages:
        raise SystemExit("no packages matched")

    reports: list[PackageReport] = []
    for package in packages:
        if not package.is_file():
            raise SystemExit(f"package not found: {package}")
        reports.append(validate_package(package))

    payload = {
        "ok": all(report.ok for report in reports),
        "packages": [report.to_json() for report in reports],
    }

    if args.json_report:
        pathlib.Path(args.json_report).write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    else:
        print(json.dumps(payload, indent=2))

    for report in reports:
        if report.ok:
            print(f"PASS {report.package}")
        else:
            print(f"FAIL {report.package}")
            for error in report.errors:
                print(f"  - {error}")

    return 0 if payload["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
