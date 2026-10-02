import importlib.util
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


module_path = Path(__file__).resolve().parent.parent / "scripts/template-draft.py"
if module_path.exists():
    specification = importlib.util.spec_from_file_location("draft", module_path)
    draft = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(draft)
else:
    draft = None


@unittest.skipIf(draft is None, "Offline template tooling is outside the runtime image")
class DraftTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"SOURCE_REPO": "offline/render-fixture", "SOURCE_BRANCH": "release-v1",
                                          "SOURCE_ROOT_DIR": "/pocket-id-passkey-sso"})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.original = {"services": [{"id": "local-test-service-binding", "name": "Pocket ID",
                                      "source": {"image": "stale"}, "variables": {"STATIC_API_KEY": {}},
                                      "volumeMounts": {"local-test-volume-binding": {"mountPath": "/wrong", "sizeMB": 1}}}]}

    def test_restore_retains_binding_and_exact_source(self):
        restored = draft.restore(self.original)
        draft.audit(restored)
        service = restored["services"][0]
        self.assertEqual(service["id"], "local-test-service-binding")
        self.assertEqual(set(service["volumeMounts"]), {"local-test-volume-binding"})
        self.assertEqual(service["source"]["rootDirectory"], "/pocket-id-passkey-sso")
        self.assertEqual(self.original["services"][0]["source"], {"image": "stale"})

    def test_audit_rejects_mutations(self):
        for field in ("source", "build", "deploy", "variables", "networking", "volumeMounts"):
            restored = draft.restore(self.original)
            restored["services"][0][field] = {}
            with self.subTest(field=field), self.assertRaises(ValueError):
                draft.audit(restored)

    def test_mapping_name_and_id_bindings_are_preserved(self):
        for binding, include_name in [("Pocket ID", False), ("local-test-service-binding", True)]:
            original_service = self.original["services"][0].copy()
            if not include_name:
                original_service.pop("name")
            original = {"services": {binding: original_service}}
            restored = draft.restore(original)
            draft.audit(restored)
            self.assertEqual(set(restored["services"]), {binding})
            self.assertEqual(restored["services"][binding]["id"], "local-test-service-binding")
            self.assertEqual(set(restored["services"][binding]["volumeMounts"]), {"local-test-volume-binding"})

    def test_audit_refuses_resolved_secret_fields(self):
        for field in ("value", "encryptedValue"):
            restored = draft.restore(self.original)
            restored["services"][0]["variables"]["GATE_ADMIN_TOKEN"][field] = "resolved-fixture-not-a-secret"
            with self.subTest(field=field), self.assertRaises(ValueError):
                draft.audit(restored)

    def test_restore_refuses_missing_volume_or_extra_services(self):
        for original in ({"services": [{"name": "Pocket ID", "volumeMounts": {}}]},
                         {"services": [{"name": "Pocket ID"}, {"name": "Public backend"}]}):
            with self.assertRaises(ValueError):
                draft.restore(original)

    def test_offline_shell_wrappers_roundtrip_and_refuse_overwrite(self):
        with tempfile.TemporaryDirectory() as temporary:
            original_path = Path(temporary) / "original.json"
            output_path = Path(temporary) / "restored.json"
            original_path.write_text(json.dumps(self.original))
            subprocess.run([str(draft.ROOT / "scripts/restore-template-draft.sh"), str(original_path), str(output_path)],
                           check=True, capture_output=True, timeout=20)
            subprocess.run([str(draft.ROOT / "scripts/audit-template.sh"), str(output_path)],
                           check=True, capture_output=True, timeout=20)
            self.assertEqual(output_path.stat().st_mode & 0o777, 0o600)
            duplicate = subprocess.run([str(draft.ROOT / "scripts/restore-template-draft.sh"), str(original_path), str(output_path)],
                                       capture_output=True, timeout=20)
            self.assertNotEqual(duplicate.returncode, 0)
