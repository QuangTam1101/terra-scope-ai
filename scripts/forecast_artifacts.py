"""Integrity checks for the owner-approved Forecast models v1 release."""
import hashlib
import re
from pathlib import Path

VARIABLES = ("precip", "soil_moisture", "tair_land", "evap_gldas", "t2m")
EXPECTED = tuple(f"forecast_{v}{suffix}.joblib" for v in VARIABLES for suffix in ("", "_outlook"))
MANIFEST_SHA256 = "def7b92323142bceeca5491622a311b631e1acbaf59bd49e35684113fe8b7985"


def sha256(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def verify_models(directory: Path, manifest_sha256: str | None = MANIFEST_SHA256) -> dict[str, str]:
    """Verify the entire set before any deserialization. Reject ambiguous manifests."""
    manifest = directory / "SHA256SUMS.txt"
    if manifest_sha256 and sha256(manifest) != manifest_sha256:
        raise ValueError("Manifest SHA256 does not match the pinned release")
    entries = {}
    for line in manifest.read_text(encoding="utf-8-sig").splitlines():
        if not line.strip():
            continue
        match = re.fullmatch(r"([a-fA-F0-9]{64})\s+\*?([A-Za-z0-9_.-]+)", line)
        if not match or match[2] in entries:
            raise ValueError("Invalid or duplicate checksum manifest entry")
        entries[match[2]] = match[1].lower()
    if set(entries) != set(EXPECTED):
        raise ValueError("Manifest must cover exactly the ten approved forecast models")
    for name in EXPECTED:
        if sha256(directory / name) != entries[name]:
            raise ValueError(f"Model SHA256 mismatch: {name}")
    return entries
