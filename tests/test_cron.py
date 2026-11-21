"""Cron handler: auth fails closed, bad input rejected, catch-up planning, lock. Run: python tests/test_cron.py"""
import os
import sys
import tempfile
import threading
import urllib.error
import urllib.request
from http.server import HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ["RUNS_DIR"] = tempfile.mkdtemp()
os.environ.pop("BLOB_READ_WRITE_TOKEN", None)
os.environ.pop("LIVE_API_URL", None)
os.environ["SARVAM_API_KEY"] = "test"  # stops engine.sarvam loading the real .env (it holds a real CRON_SECRET)
os.environ.pop("CRON_SECRET", None)

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "api"))
import cron  # noqa: E402
from engine import store  # noqa: E402

srv = HTTPServer(("127.0.0.1", 0), cron.handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()


def get(path, token=None):
    req = urllib.request.Request(f"http://127.0.0.1:{srv.server_port}{path}", headers={"authorization": f"Bearer {token}"} if token else {})
    try:
        return urllib.request.urlopen(req).status
    except urllib.error.HTTPError as e:
        return e.code


assert get("/") == 503, "must refuse when CRON_SECRET is unset"
os.environ["CRON_SECRET"] = "s3"
assert get("/") == 401 and get("/", "wrong") == 401
assert get("/?as_of=tomorrow", "s3") == 400

# catch-up planning
assert cron.pending("2026-10-31", "2026-11-21", ["2026-10-29"]) == ["2026-10-30", "2026-10-31"]
assert cron.pending("2026-10-31", "2026-11-21", ["2026-10-31"]) == []            # caught up
assert cron.pending("2026-11-05", "2026-11-08", ["2026-11-05"]) == []            # waiting for data
assert cron.pending("2026-10-31", "2026-11-21", []) == ["2026-10-31"]            # first run: latest day only

# lock
assert cron.take_lock() and not cron.take_lock()
assert get("/", "s3") == 409
cron.drop_lock()
assert cron.take_lock()
cron.drop_lock()
print("cron ok")
