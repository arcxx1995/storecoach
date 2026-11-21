"""Live source: sync appends without duplicates, data_end follows the API, cron picks up the next day.
Run: python tests/test_source.py   (uses scripts/mock_api.py in-process, needs no network)"""
import os
import sys
import tempfile
import threading
from http.server import HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
os.environ["RUNS_DIR"] = tempfile.mkdtemp()
os.environ.pop("BLOB_READ_WRITE_TOKEN", None)

import mock_api  # noqa: E402

srv = HTTPServer(("127.0.0.1", 0), mock_api.make("2026-09-10"))
threading.Thread(target=srv.serve_forever, daemon=True).start()
os.environ["LIVE_API_URL"] = f"http://127.0.0.1:{srv.server_port}"

from engine import source  # noqa: E402
import urllib.request  # noqa: E402


def through(d):
    urllib.request.urlopen(f"{os.environ['LIVE_API_URL']}/__through?date={d}").read()


got = source.sync()
assert got["bills"] > 0 and got["bill_lines"] > 0
assert source.data_end().date().isoformat() == "2026-09-10", source.data_end()
n1 = len(source.table("bills"))

source.sync()  # nothing new: overlap re-fetch must not duplicate
assert len(source.table("bills")) == n1

through("2026-09-12")
source.sync()
assert source.data_end().date().isoformat() == "2026-09-12"
b = source.table("bills")
assert len(b) > n1 and b.bill_id.is_unique
lines = source.table("bill_lines")
assert set(lines.bill_id) <= set(b.bill_id), "orphan lines"
print("source ok")
