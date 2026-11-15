"""Public build download never deserializes; verify integrity before installation."""
import hashlib
import importlib.util
import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
from forecast_artifacts import EXPECTED

spec = importlib.util.spec_from_file_location("fetch_models", SCRIPTS / "fetch-forecast-models.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PublicDownloadTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.assets = {name: name.encode() for name in EXPECTED}
        manifest = "\n".join(f"{hashlib.sha256(raw).hexdigest()}  {name}" for name, raw in self.assets.items()).encode()
        self.assets["SHA256SUMS.txt"] = manifest
        self.pin = hashlib.sha256(manifest).hexdigest()

    def response(self, request, **kwargs):
        return io.BytesIO(self.assets[request.full_url.rsplit("/", 1)[-1]])

    def test_verified_public_download(self):
        with patch.object(module.urllib.request, "urlopen", side_effect=self.response):
            module.download_public_assets(self.directory, self.pin)
        self.assertTrue(all((self.directory / name).is_file() for name in EXPECTED))

    def test_manifest_change_blocks_all_model_downloads(self):
        with patch.object(module.urllib.request, "urlopen", side_effect=self.response) as network:
            with self.assertRaisesRegex(ValueError, "pinned release"):
                module.download_public_assets(self.directory, "0" * 64)
        self.assertEqual(network.call_count, 1)
        self.assertFalse(any(self.directory.glob("*.joblib")))

    def test_corrupted_model_rejected(self):
        self.assets[EXPECTED[-1]] = b"corrupt"
        with patch.object(module.urllib.request, "urlopen", side_effect=self.response):
            with self.assertRaisesRegex(ValueError, "mismatch"):
                module.download_public_assets(self.directory, self.pin)
