"""Download the owner-approved GitHub release; verify before installation.

Requires gh auth login or GH_TOKEN with repository read access. Never loads joblib.
"""
import argparse
import shutil
import subprocess
import tempfile
import urllib.request
from pathlib import Path

from forecast_artifacts import EXPECTED, sha256, verify_models

ROOT = Path(__file__).resolve().parents[1]


def download_public_assets(directory: Path, manifest_sha256: str):
    """Public build path: pin the manifest before downloading any model bytes."""
    base = "https://github.com/QuangTam1101/terra-scope-ai/releases/download/forecast-models-v1/"
    def download(name):
        request = urllib.request.Request(base + name, headers={"User-Agent": "terra-scope-build"})
        try:
            with urllib.request.urlopen(request, timeout=120) as response, (directory / name).open("wb") as target:
                shutil.copyfileobj(response, target)
        except Exception:
            raise RuntimeError("Public release download failed; check release availability and build network") from None
    download("SHA256SUMS.txt")
    if sha256(directory / "SHA256SUMS.txt") != manifest_sha256:
        raise ValueError("Manifest SHA256 does not match the pinned release")
    for name in EXPECTED:
        download(name)
    verify_models(directory, manifest_sha256)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gh", default="gh", help="Path to an authenticated GitHub CLI")
    parser.add_argument("--manifest-sha256", required=True, help="Owner-reviewed SHA256 of SHA256SUMS.txt")
    parser.add_argument("--public", action="store_true", help="Download the now-public release over HTTPS without credentials or gh")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="terra-forecast-release-") as stage:
        directory = Path(stage)
        command = [args.gh, "release", "download", "forecast-models-v1", "--repo",
                   "QuangTam1101/terra-scope-ai", "--dir", stage, "--pattern", "forecast_*.joblib",
                   "--pattern", "SHA256SUMS.txt"]
        if args.public:
            download_public_assets(directory, args.manifest_sha256)
        else:
            result = subprocess.run(command, capture_output=True, timeout=600)
            if result.returncode:
                raise RuntimeError("GitHub release download failed; check gh authentication and repository read access")
        verify_models(directory, args.manifest_sha256)
        destination = ROOT / "data-pipeline/models"
        destination.mkdir(parents=True, exist_ok=True)
        names = (*EXPECTED, "SHA256SUMS.txt")
        for name in names:
            target = destination / name
            if target.exists() and sha256(target) != sha256(directory / name):
                raise ValueError(f"Refusing to overwrite a different local artifact: {name}")
        for name in names:
            if not (destination / name).exists():
                shutil.copyfile(directory / name, destination / name)
        print("Verified and installed all ten forecast models and the pinned checksum manifest")


if __name__ == "__main__":
    main()
