"""Vercel Cron entry: pulls new live data, then runs Store Coach for every day not yet run (oldest first).

GET /api/cron                 -> sync live data, run each missing day up to yesterday (IST) or the data's last day
GET /api/cron?as_of=YYYY-MM-DD[&force=1][&resend=1]   -> run (or redo) one day; resend=1 also re-sends Telegram messages already delivered
Always requires `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends it). With no CRON_SECRET set it refuses.
Replies: 200 ran / up to date, 202 waiting for data, 400 bad input, 401/503 auth, 409 another run in progress, 500 failed.
"""
import hmac
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("SARVAM_CACHE", "/tmp/sarvam")  # only /tmp is writable on Vercel
os.environ.setdefault("RUNS_DIR", "/tmp/runs")

from engine import deliver, source, store  # noqa: E402
from engine.run import run  # noqa: E402

IST = timezone(timedelta(hours=5, minutes=30))
LIMIT = 300            # vercel.json maxDuration
MAX_DAYS = 3           # catch-up days per call; the next call continues
LOCK_SECONDS = LIMIT + 30
SAFETY = 40            # seconds kept for writing files after Sarvam stops


def pending(data_end: str, upto: str, done: list[str]) -> list[str]:
    """Days still to run: everything after the last run up to min(upto, data_end). First ever run: just the last day."""
    last = min(upto, data_end)
    if not done:
        return [last]
    nxt = (datetime.fromisoformat(done[-1]) + timedelta(days=1)).date()
    out = []
    while nxt.isoformat() <= last:
        out.append(nxt.isoformat())
        nxt += timedelta(days=1)
    return out


def take_lock() -> bool:
    cur = store.read_json("lock.json") or {}
    if cur.get("until", 0) > time.time():
        return False
    store.write_json("lock.json", {"until": time.time() + LOCK_SECONDS})
    return True  # ponytail: Blob has no compare-and-set; two calls within the same second could both pass. Fine for one daily cron.


def drop_lock() -> None:
    store.write_json("lock.json", {"until": 0})


class handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: dict):
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())

    def do_GET(self):
        secret = os.environ.get("CRON_SECRET")
        if not secret:
            return self._send(503, {"error": "CRON_SECRET is not set"})
        got = self.headers.get("authorization") or ""
        if not hmac.compare_digest(got.encode(), f"Bearer {secret}".encode()):
            return self._send(401, {"error": "unauthorized"})
        q = parse_qs(urlparse(self.path).query)
        one = q.get("as_of", [None])[0]
        if one and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", one):
            return self._send(400, {"error": "as_of must be YYYY-MM-DD"})
        if not take_lock():
            return self._send(409, {"status": "another run is in progress"})
        t0 = time.time()
        try:
            synced = source.sync()
            end = source.data_end().date().isoformat()
            done = store.run_dates()
            if one:
                days = [one] if (q.get("force") or one not in done) and one <= end else []
            else:
                yesterday = (datetime.now(IST) - timedelta(days=1)).date().isoformat()
                days = pending(end, yesterday, done)
                days = [d for d in days if d not in done][:MAX_DAYS]
            if not days:
                waiting = end < (datetime.now(IST) - timedelta(days=1)).date().isoformat()
                return self._send(202 if waiting else 200, {
                    "status": "waiting for data" if waiting else "up to date", "data_ends": end,
                    "latest": done[-1] if done else None})
            ran = []
            for n, d in enumerate(days):
                last = n == len(days) - 1  # every day gets a voiced AM briefing (6 calls); only the newest also voices the cards
                budget = max(0, LIMIT - SAFETY - (time.time() - t0))
                ran.append(run(d, use_sarvam=True, voice_cards=last, budget=budget))
            out = {"status": "ran", "days": ran, "data_ends": end, "synced": synced}
            try:  # the data is already saved; a delivery problem must not turn the run into a failure
                out["delivered"] = deliver.deliver(ran[-1], resend=bool(q.get("resend")))
            except Exception as e:
                print("delivery failed:", repr(e), file=sys.stderr)
                out["delivery_error"] = repr(e)
            out["seconds"] = round(time.time() - t0, 1)
            return self._send(200, out)
        except Exception as e:  # surfaces in Vercel logs and in the response
            print("cron failed:", repr(e), file=sys.stderr)
            return self._send(500, {"status": "failed", "error": repr(e)})
        finally:
            drop_lock()
