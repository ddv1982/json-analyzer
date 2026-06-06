#!/usr/bin/env python3
"""Verify dpkg-sig Debian package signatures, including zstd-compressed debs."""

from __future__ import annotations

import argparse
import glob
import hashlib
import os
import pathlib
import shutil
import subprocess
import tempfile
from dataclasses import dataclass


AR_MAGIC = b"!<arch>\n"
AR_HEADER_SIZE = 60


@dataclass(frozen=True)
class ArMember:
    name: str
    data: bytes


@dataclass(frozen=True)
class SignedFile:
    md5sum: str
    sha1sum: str
    size: int
    name: str


def read_ar_members(package: pathlib.Path) -> list[ArMember]:
    data = package.read_bytes()
    if not data.startswith(AR_MAGIC):
        raise ValueError(f"{package} is not an ar archive")

    members: list[ArMember] = []
    offset = len(AR_MAGIC)
    while offset < len(data):
        header = data[offset : offset + AR_HEADER_SIZE]
        if len(header) != AR_HEADER_SIZE:
            raise ValueError(f"{package} has a truncated ar header")
        if header[58:60] != b"`\n":
            raise ValueError(f"{package} has an invalid ar header")

        raw_name = header[:16].decode("utf-8").strip()
        size_text = header[48:58].decode("ascii").strip()
        try:
            size = int(size_text)
        except ValueError as error:
            raise ValueError(f"{package} has an invalid ar member size: {size_text!r}") from error

        offset += AR_HEADER_SIZE
        member_data = data[offset : offset + size]
        if len(member_data) != size:
            raise ValueError(f"{package} has a truncated ar member: {raw_name}")

        members.append(ArMember(name=raw_name.rstrip("/"), data=member_data))
        offset += size
        if offset % 2:
            offset += 1

    return members


def import_public_key(public_key: pathlib.Path, gnupg_home: pathlib.Path) -> None:
    completed = subprocess.run(
        ["gpg", "--batch", "--homedir", str(gnupg_home), "--import", str(public_key)],
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout).strip()
        raise RuntimeError(f"could not import Debian signing public key: {detail}")


def verify_clearsigned_signature(signature: bytes, gnupg_home: pathlib.Path) -> tuple[str, str]:
    signature_path = gnupg_home / "signature.asc"
    payload_path = gnupg_home / "signature.payload"
    signature_path.write_bytes(signature)

    completed = subprocess.run(
        [
            "gpg",
            "--batch",
            "--homedir",
            str(gnupg_home),
            "--openpgp",
            "--decrypt",
            "--no-auto-check-trustdb",
            "--no-tty",
            "--status-fd",
            "1",
            "--output",
            str(payload_path),
            str(signature_path),
        ],
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    output = completed.stdout
    if completed.returncode != 0 or "[GNUPG:] GOODSIG" not in output:
        raise RuntimeError(f"GPG signature verification failed: {output.strip()}")

    valid_fingerprint = ""
    for line in output.splitlines():
        if line.startswith("[GNUPG:] VALIDSIG "):
            valid_fingerprint = line.split()[2].upper()
            break

    if not valid_fingerprint:
        raise RuntimeError("GPG did not report a VALIDSIG fingerprint")

    return payload_path.read_text(encoding="utf-8"), valid_fingerprint


def parse_signed_payload(payload: str) -> tuple[dict[str, str], list[SignedFile]]:
    fields: dict[str, str] = {}
    active_field = ""
    for line in payload.splitlines():
        if not line.strip():
            continue
        if line[0].isspace() and active_field:
            fields[active_field] = f"{fields[active_field]}\n{line.strip()}".strip()
            continue
        if ":" not in line:
            raise ValueError(f"invalid signed payload line: {line!r}")
        key, value = line.split(":", 1)
        active_field = key.lower()
        fields[active_field] = value.strip()

    signed_files: list[SignedFile] = []
    for file_line in fields.get("files", "").splitlines():
        parts = file_line.split()
        if len(parts) != 4:
            raise ValueError(f"invalid signed Files entry: {file_line!r}")
        md5sum, sha1sum, size_text, name = parts
        signed_files.append(SignedFile(md5sum=md5sum, sha1sum=sha1sum, size=int(size_text), name=name))

    return fields, signed_files


def member_hashes(member: ArMember) -> tuple[str, str, int]:
    return (
        hashlib.md5(member.data, usedforsecurity=False).hexdigest(),
        hashlib.sha1(member.data, usedforsecurity=False).hexdigest(),
        len(member.data),
    )


def is_control_member(name: str) -> bool:
    return name == "control.tar" or name.startswith("control.tar.")


def is_data_member(name: str) -> bool:
    return name == "data.tar" or name.startswith("data.tar.")


def verify_package(package: pathlib.Path, public_key: pathlib.Path, expected_fingerprint: str, role: str) -> None:
    members = read_ar_members(package)
    members_by_name = {member.name: member for member in members}
    signature_name = f"_gpg{role}"
    signature_member = members_by_name.get(signature_name)
    if signature_member is None:
        raise RuntimeError(f"{package} does not contain {signature_name}")

    if shutil.which("gpg") is None:
        raise RuntimeError("gpg was not found")

    with tempfile.TemporaryDirectory(prefix="ja-deb-sig-") as temp:
        gnupg_home = pathlib.Path(temp)
        os.chmod(gnupg_home, 0o700)
        import_public_key(public_key, gnupg_home)
        payload, valid_fingerprint = verify_clearsigned_signature(signature_member.data, gnupg_home)

    normalized_expected = expected_fingerprint.replace(" ", "").upper()
    if valid_fingerprint != normalized_expected:
        raise RuntimeError(
            f"{package} was signed by {valid_fingerprint}, expected {normalized_expected}"
        )

    fields, signed_files = parse_signed_payload(payload)
    if fields.get("role") != role:
        raise RuntimeError(f"{package} signature role is {fields.get('role')!r}, expected {role!r}")
    if fields.get("signer", "").replace(" ", "").upper() != normalized_expected:
        raise RuntimeError(f"{package} signature signer field does not match expected fingerprint")

    seen_names = set()
    for signed_file in signed_files:
        member = members_by_name.get(signed_file.name)
        if member is None:
            raise RuntimeError(f"{package} signature references missing member {signed_file.name}")

        md5sum, sha1sum, size = member_hashes(member)
        if (md5sum, sha1sum, size) != (signed_file.md5sum, signed_file.sha1sum, signed_file.size):
            raise RuntimeError(f"{package} signature hash mismatch for {signed_file.name}")
        seen_names.add(signed_file.name)

    if "debian-binary" not in seen_names:
        raise RuntimeError(f"{package} signature does not cover debian-binary")
    if not any(is_control_member(name) for name in seen_names):
        raise RuntimeError(f"{package} signature does not cover a control.tar member")
    if not any(is_data_member(name) for name in seen_names):
        raise RuntimeError(f"{package} signature does not cover a data.tar member")


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
    parser.add_argument("--public-key", required=True, type=pathlib.Path)
    parser.add_argument("--fingerprint", required=True)
    parser.add_argument("--role", default="builder")
    args = parser.parse_args()

    public_key = args.public_key
    if not public_key.is_file():
        raise SystemExit(f"public key not found: {public_key}")

    packages = expand_packages(args.packages)
    for package in packages:
        if not package.is_file():
            raise SystemExit(f"package not found: {package}")
        verify_package(package, public_key, args.fingerprint, args.role)
        print(f"Verified Debian package signature: {package}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
