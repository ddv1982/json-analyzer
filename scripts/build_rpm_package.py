#!/usr/bin/env python3
"""Build JSON Analyzer's canonical RPM package from the Tauri release binary."""

from __future__ import annotations

import argparse
import json
import pathlib
import shutil
import subprocess
import tempfile
import textwrap


APPSTREAM_ID = "com.jsonanalyzer.desktop"
DESKTOP_ID = "com.jsonanalyzer.desktop.desktop"
PACKAGE_NAME = "json-analyzer"
RPM_RELEASE = "1"
TARGET_ARCHES = {
    "x86_64-unknown-linux-gnu": "x86_64",
}


def copy_source(path: pathlib.Path, destination: pathlib.Path) -> None:
    if not path.is_file():
        raise FileNotFoundError(f"required RPM source file does not exist: {path}")
    shutil.copy2(path, destination)


def build_spec(version: str) -> str:
    return textwrap.dedent(
        f"""\
        %global debug_package %{{nil}}

        Name:           {PACKAGE_NAME}
        Version:        {version}
        Release:        {RPM_RELEASE}%{{?dist}}
        Summary:        Local-first JSON analysis tool
        License:        MIT
        URL:            https://github.com/ddv1982/json-analyzer
        Source0:        json-analyzer-app
        Source1:        {DESKTOP_ID}
        Source2:        {APPSTREAM_ID}.metainfo.xml
        Source3:        LICENSE
        Source4:        json-analyzer-32.png
        Source5:        json-analyzer-128.png
        Source6:        json-analyzer-256.png
        Source7:        json-analyzer-512.png

        %description
        JSON Analyzer validates, formats, and explores JSON data locally,
        including duplicate records, field patterns, grouped values, and
        guarded curl responses.

        %prep

        %build

        %install
        rm -rf %{{buildroot}}
        install -Dm755 %{{SOURCE0}} %{{buildroot}}/usr/bin/json-analyzer-app
        install -Dm644 %{{SOURCE1}} %{{buildroot}}/usr/share/applications/{DESKTOP_ID}
        install -Dm644 %{{SOURCE2}} %{{buildroot}}/usr/share/metainfo/{APPSTREAM_ID}.metainfo.xml
        install -Dm644 %{{SOURCE3}} %{{buildroot}}/usr/share/licenses/{PACKAGE_NAME}/LICENSE
        install -Dm644 %{{SOURCE4}} %{{buildroot}}/usr/share/icons/hicolor/32x32/apps/json-analyzer.png
        install -Dm644 %{{SOURCE5}} %{{buildroot}}/usr/share/icons/hicolor/128x128/apps/json-analyzer.png
        install -Dm644 %{{SOURCE6}} %{{buildroot}}/usr/share/icons/hicolor/256x256/apps/json-analyzer.png
        install -Dm644 %{{SOURCE7}} %{{buildroot}}/usr/share/icons/hicolor/512x512/apps/json-analyzer.png

        %files
        /usr/bin/json-analyzer-app
        /usr/share/applications/{DESKTOP_ID}
        /usr/share/metainfo/{APPSTREAM_ID}.metainfo.xml
        /usr/share/icons/hicolor/32x32/apps/json-analyzer.png
        /usr/share/icons/hicolor/128x128/apps/json-analyzer.png
        /usr/share/icons/hicolor/256x256/apps/json-analyzer.png
        /usr/share/icons/hicolor/512x512/apps/json-analyzer.png
        %license /usr/share/licenses/{PACKAGE_NAME}/LICENSE
        """
    )


def build_rpm(root: pathlib.Path, target: str) -> pathlib.Path:
    rpmbuild = shutil.which("rpmbuild")
    if not rpmbuild:
        raise RuntimeError("rpmbuild was not found; install the rpm package before building RPMs")

    if target not in TARGET_ARCHES:
        raise RuntimeError(f"unsupported RPM target: {target}")
    arch = TARGET_ARCHES[target]

    tauri_conf = json.loads((root / "src-tauri/tauri.conf.json").read_text(encoding="utf-8"))
    version = tauri_conf["version"]
    main_binary = tauri_conf["mainBinaryName"]

    release_dir = root / "src-tauri/target" / target / "release"
    binary_path = release_dir / main_binary
    output_dir = release_dir / "bundle/rpm"
    output_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="json-analyzer-rpm-build-") as temp:
        topdir = pathlib.Path(temp) / "rpmbuild"
        sources_dir = topdir / "SOURCES"
        specs_dir = topdir / "SPECS"
        sources_dir.mkdir(parents=True)
        specs_dir.mkdir(parents=True)

        copy_source(binary_path, sources_dir / "json-analyzer-app")
        copy_source(root / "src-tauri/linux" / DESKTOP_ID, sources_dir / DESKTOP_ID)
        copy_source(
            root / "src-tauri/appstream" / f"{APPSTREAM_ID}.metainfo.xml",
            sources_dir / f"{APPSTREAM_ID}.metainfo.xml",
        )
        copy_source(root / "LICENSE", sources_dir / "LICENSE")
        copy_source(root / "src-tauri/icons/32x32.png", sources_dir / "json-analyzer-32.png")
        copy_source(root / "src-tauri/icons/128x128.png", sources_dir / "json-analyzer-128.png")
        copy_source(root / "src-tauri/icons/128x128@2x.png", sources_dir / "json-analyzer-256.png")
        copy_source(root / "src-tauri/icons/icon.png", sources_dir / "json-analyzer-512.png")

        spec_path = specs_dir / f"{PACKAGE_NAME}.spec"
        spec_path.write_text(build_spec(version), encoding="utf-8")

        completed = subprocess.run(
            [
                rpmbuild,
                "-bb",
                str(spec_path),
                "--target",
                arch,
                "--define",
                f"_topdir {topdir}",
                "--define",
                "_build_id_links none",
            ],
            check=False,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        if completed.returncode != 0:
            raise RuntimeError(
                "rpmbuild failed\nSTDOUT:\n"
                + completed.stdout
                + "\nSTDERR:\n"
                + completed.stderr
            )

        built_rpms = sorted((topdir / "RPMS" / arch).glob("*.rpm"))
        if len(built_rpms) != 1:
            raise RuntimeError(f"expected exactly one built RPM, found {built_rpms!r}")

        for old_rpm in output_dir.glob("*.rpm"):
            old_rpm.unlink()
        destination = output_dir / built_rpms[0].name
        shutil.copy2(built_rpms[0], destination)
        return destination


def main() -> int:
    parser = argparse.ArgumentParser(description="Build JSON Analyzer's canonical RPM package.")
    parser.add_argument("--target", default="x86_64-unknown-linux-gnu")
    args = parser.parse_args()

    root = pathlib.Path(__file__).resolve().parent.parent
    rpm_path = build_rpm(root, args.target)
    print(f"Built RPM package: {rpm_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
