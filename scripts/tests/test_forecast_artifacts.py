"""The integrity gate uses byte fixtures, never pickle/joblib deserialization."""
import hashlib
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from forecast_artifacts import EXPECTED, verify_models


class ArtifactIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.lines = []
        for name in EXPECTED:
            raw = name.encode()
            (self.root / name).write_bytes(raw)
            self.lines.append(f"{hashlib.sha256(raw).hexdigest()}  {name}")
        self.manifest = self.root / "SHA256SUMS.txt"
        self.manifest.write_text("\n".join(self.lines))

    def test_exact_verified_set(self):
        self.assertEqual(len(verify_models(self.root, None)), 10)

    def test_corrupt_model_rejected(self):
        (self.root / EXPECTED[-1]).write_bytes(b"tampered")
        with self.assertRaisesRegex(ValueError, "mismatch"):
            verify_models(self.root, None)

    def test_missing_model_rejected(self):
        (self.root / EXPECTED[0]).unlink()
        with self.assertRaises(FileNotFoundError):
            verify_models(self.root, None)

    def test_duplicate_rejected(self):
        self.manifest.write_text("\n".join(self.lines + [self.lines[0]]))
        with self.assertRaisesRegex(ValueError, "duplicate"):
            verify_models(self.root, None)

    def test_path_traversal_rejected(self):
        self.manifest.write_text(self.lines[0].replace(EXPECTED[0], "../" + EXPECTED[0]))
        with self.assertRaises(ValueError):
            verify_models(self.root, None)

    def test_changed_manifest_rejected_by_pin(self):
        with self.assertRaisesRegex(ValueError, "pinned release"):
            verify_models(self.root)
