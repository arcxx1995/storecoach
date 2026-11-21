"""Telegram delivery against an in-process fake Bot API. Run: python tests/test_deliver.py"""
import json
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ["RUNS_DIR"] = tempfile.mkdtemp()
os.environ.pop("BLOB_READ_WRITE_TOKEN", None)
os.environ["SARVAM_API_KEY"] = "test"  # keep the real .env out of the test
os.environ.pop("DELIVERY_DRY_RUN", None)

calls, behave = [], {}


class Fake(BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers["content-length"]))
        method = self.path.rsplit("/", 1)[1]
        chat = json.loads(body)["chat_id"] if method == "sendMessage" else None
        if method == "sendAudio":
            chat = int(body.split(b'name="chat_id"\r\n\r\n')[1].split(b"\r\n")[0])
        calls.append((method, chat, body))
        code, out = behave.get(chat, [(200, {"ok": True, "result": {}})]).pop(0) if behave.get(chat) else (200, {"ok": True, "result": {}})
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(out).encode())

    def log_message(self, *a):
        pass


srv = HTTPServer(("127.0.0.1", 0), Fake)
threading.Thread(target=srv.serve_forever, daemon=True).start()
os.environ.update(TELEGRAM_API_URL=f"http://127.0.0.1:{srv.server_port}", TELEGRAM_BOT_TOKEN="t",
                  APP_URL="https://app.example.com")

from engine import deliver, store  # noqa: E402

issue = {"title": "Bills <down> & out", "rupees": 273000, "action": {"who": "Store manager", "what": "Roster 2 more people", "when": "this week"}}
dg = lambda name, new=(), fu=(), local=None, audio=None: {  # noqa: E731
    "name": name, "city": "Lucknow", "new_today": list(new), "followups": list(fu), "briefing_local": local, "briefing_audio": audio}

# formatting
t = deliver.format_message(dg("Rakesh S", [issue]), "2026-10-31")
assert "Bills &lt;down&gt; &amp; out" in t and "₹2.7 lakh" in t and t.startswith("<b>Good morning Rakesh")
assert "All clear" in deliver.format_message(dg("Rakesh S"), "2026-10-31")
assert "All clear" in deliver.format_message(dg("A B", fu=[{"status": "too_early", "summary": "x"}]), "d")  # too-early is not news
assert "All clear" not in deliver.format_message(dg("A B", fu=[{"status": "improved", "summary": "Better"}]), "d")
assert len(deliver.format_message(dg("A", [dict(issue, title="x" * 3000)] * 3), "d")) <= 4096

# delivery: 3 managers; AM-02 blocked the bot; AM-03 has no chat id
store.write_bytes("2026-10-31/audio/briefing_AM-01.mp3", b"ID3fake")
store.write_json("2026-10-31/digests.json", {"digests": {
    "AM-01": dg("Rakesh S", [issue], audio="2026-10-31/audio/briefing_AM-01.mp3") | {"city": "Lucknow"},
    "AM-02": dg("Alok T"), "AM-03": dg("Nitin S")}})
os.environ["DELIVERY_RECIPIENTS"] = json.dumps({"AM-01": {"chat_id": 11}, "AM-02": {"chat_id": 22}})
behave[22] = [(403, {"ok": False, "description": "Forbidden: bot was blocked by the user"})]

r = deliver.deliver("2026-10-31")
assert r["ok"] == ["AM-01"] and list(r["failed"]) == ["AM-02"] and r["skipped"] == ["AM-03"], r
kinds = [(m, c) for m, c, _ in calls]
assert ("sendMessage", 11) in kinds and ("sendAudio", 11) in kinds and ("sendMessage", 22) in kinds
assert b"ID3fake" in [b for m, c, b in calls if m == "sendAudio"][0]
assert "reply_markup" in json.loads([b for m, c, b in calls if m == "sendMessage" and c == 11][0])  # dashboard button

n = len(calls)
r = deliver.deliver("2026-10-31")  # rerun: AM-01 already ok -> not sent again; AM-02 retried
assert "AM-01" in r["skipped"] and not [c for m, c, _ in calls[n:] if c == 11]
assert store.read_json("2026-10-31/delivered.json")["AM-01"]["status"] == "ok"

# 429 then success
behave[11] = [(429, {"ok": False, "parameters": {"retry_after": 0}}), (200, {"ok": True, "result": {}})]
deliver.deliver("2026-10-31", resend=True)
assert sum(1 for m, c, _ in calls if m == "sendMessage" and c == 11) >= 3
print("deliver ok")

# registered subscribers (written by the webhook) are used; env overrides them
os.environ["TELEGRAM_SECRET"] = "s3cret"
store.write_json("subscribers/AM-03.json", {"chat_id": 33})
assert deliver.recipients(["AM-03", "AM-04"]) == {"AM-03": {"chat_id": 33}} | {"AM-01": {"chat_id": 11}, "AM-02": {"chat_id": 22}}
os.environ["DELIVERY_RECIPIENTS"] = '{"AM-03": {"chat_id": 99}}'
assert deliver.recipients(["AM-03"])["AM-03"]["chat_id"] == 99
assert len(deliver.link_code("AM-01")) == 16 and deliver.link_code("AM-01") != deliver.link_code("AM-02")
print("subscribers ok")
