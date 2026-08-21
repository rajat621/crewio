"""
Phase 4.14 regression test.

_save_upload() (main.py) previously used the client-supplied filename
directly to construct a filesystem path (_UPLOAD_DIR / file_obj.filename).
pathlib's / operator does not sanitize ".." segments, and for an
absolute-path right operand it discards the left side entirely - a
crafted filename could write outside the intended upload directory to
any location the process has write access to (arbitrary file write /
potential RCE).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import main


class FakeFileStorage:
    def __init__(self, filename):
        self.filename = filename
        self.saved_to = None

    def save(self, path):
        self.saved_to = path
        with open(path, "w") as f:
            f.write("test content")


class TestUploadPathTraversalSafety:
    def test_relative_traversal_stays_inside_upload_dir(self):
        f = FakeFileStorage("../../../../tmp/traversal_test_marker.txt")
        result = main._save_upload(f)
        assert result.startswith(str(main._UPLOAD_DIR))
        assert not os.path.exists("/tmp/traversal_test_marker.txt")

    def test_absolute_path_stays_inside_upload_dir(self):
        f = FakeFileStorage("/tmp/absolute_path_test_marker.txt")
        result = main._save_upload(f)
        assert result.startswith(str(main._UPLOAD_DIR))
        assert not os.path.exists("/tmp/absolute_path_test_marker.txt")

    def test_normal_filename_still_works(self):
        f = FakeFileStorage("my_timesheet.pdf")
        result = main._save_upload(f)
        assert result.startswith(str(main._UPLOAD_DIR))
        assert result.endswith(".pdf")

    def test_missing_filename_falls_back_safely(self):
        f = FakeFileStorage(None)
        result = main._save_upload(f)
        assert result.startswith(str(main._UPLOAD_DIR))
        assert result.endswith(".pdf")

    def test_two_uploads_do_not_collide(self):
        f1 = FakeFileStorage("same_name.pdf")
        f2 = FakeFileStorage("same_name.pdf")
        result1 = main._save_upload(f1)
        result2 = main._save_upload(f2)
        assert result1 != result2


class TestDownloadInvoicePathTraversalSafety:
    """
    Closure-pass regression test. download_invoice() (main.py) previously
    joined the raw <filename> route segment straight onto _OUTPUT_DIR with
    no sanitization. A bare '..' segment (valid in Flask's default
    <filename> converter, which only forbids '/') resolved one level up to
    the shared OS temp root - a confirmed directory-traversal escape from
    the intended output directory, even though the deeper multi-hop form
    isn't reachable through the URL.
    """

    def _client(self):
        os.environ.pop("AI_SERVICE_SHARED_SECRET", None)
        return main.app.test_client()

    def test_dotdot_traversal_rejected(self):
        resp = self._client().get("/download-invoice/..")
        assert resp.status_code == 400

    def test_dotdot_with_extension_rejected(self):
        resp = self._client().get("/download-invoice/..%2Fsecrets.txt")
        assert resp.status_code in (400, 404)

    def test_normal_filename_still_works(self):
        main._OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        target = main._OUTPUT_DIR / "closure_pass_test_invoice.pdf"
        target.write_bytes(b"%PDF-1.4 test")
        try:
            resp = self._client().get("/download-invoice/closure_pass_test_invoice.pdf")
            assert resp.status_code == 200
            assert resp.mimetype == "application/pdf"
            resp.close()
        finally:
            # send_file() can briefly hold the Windows file handle open past
            # the response object's own close(); this cleanup is best-effort
            # and not the behavior under test.
            try:
                target.unlink(missing_ok=True)
            except PermissionError:
                pass

    def test_missing_file_still_404s(self):
        resp = self._client().get("/download-invoice/does_not_exist_marker.pdf")
        assert resp.status_code == 404


class TestDebugEndpointDisabledByDefault:
    def test_debug_endpoint_404s_without_env_var(self):
        os.environ.pop("AI_SERVICE_ENABLE_DEBUG_ENDPOINT", None)
        client = main.app.test_client()
        resp = client.get("/debug")
        assert resp.status_code == 404
        body = resp.get_json()
        assert "cwd" not in body
        assert "file" not in body

    def test_debug_endpoint_works_when_explicitly_enabled(self):
        os.environ["AI_SERVICE_ENABLE_DEBUG_ENDPOINT"] = "true"
        try:
            client = main.app.test_client()
            resp = client.get("/debug")
            assert resp.status_code == 200
            body = resp.get_json()
            assert "cwd" in body
        finally:
            os.environ.pop("AI_SERVICE_ENABLE_DEBUG_ENDPOINT", None)
