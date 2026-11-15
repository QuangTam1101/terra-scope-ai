"""Download the approved private GitHub release; verify all files before installation.

Requires gh auth login or GH_TOKEN with repository read access. Never loads joblib.
"""
import argparse
import shutil
import subprocess
import tempfile
from pathlib import Path

from forecast_artifacts import EXPECTED, sha256, verify_models

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gh", default="gh", help="Path to an authenticated GitHub CLI")
    parser.add_argument("--manifest-sha256", required=True, help="Owner-reviewed SHA256 of SHA256SUMS.txt")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="terra-forecast-release-") as stage:
        directory = Path(stage)
        command = [args.gh, "release", "download", "forecast-models-v1", "--repo",
                   "QuangTam1101/terra-scope-ai", "--dir", stage, "--pattern", "forecast_*.joblib",
                   "--pattern", "SHA256SUMS.txt"]
        result = subprocess.run(command, capture_output=True)
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
