"""Vercel Cron entry: runs Store Coach for today's as-of date and writes the run to Vercel Blob.

GET /api/cron            -> as_of = yesterday (IST), capped at the data's last day; skips if already run
GET /api/cron?as_of=...&force=1
Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; anything else is refused when CRON_SECRET is set.
"""
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("SARVAM_CACHE", "/tmp/sarvam")  # only /tmp is writable on Vercel
os.environ.setdefault("RUNS_DIR", "/tmp/runs")

from engine import store  # noqa: E402
from engine.load import LAST_DAY  # noqa: E402
from engine.run import run  # noqa: E402

IST = timezone(timedelta(hours=5, minutes=30))


class handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: dict):
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())

    def do_GET(self):
        secret = os.environ.get("CRON_SECRET")
        if secret and self.headers.get("authorization") != f"Bearer {secret}":
            return self._send(401, {"error": "unauthorized"})
        q = parse_qs(urlparse(self.path).query)
        yesterday = (datetime.now(IST) - timedelta(days=1)).date().isoformat()
        as_of = q.get("as_of", [min(yesterday, LAST_DAY.date().isoformat())])[0]
        if not q.get("force") and store.read_json(f"{as_of}/digests.json"):
            return self._send(200, {"as_of": as_of, "status": "already ran", "note": "data ends 2026-10-31"})
        return self._send(200, {"as_of": run(as_of), "status": "ran"})
