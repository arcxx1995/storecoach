"""Drives the Telegram webhook (app/api/telegram/route.ts) with a fake Telegram Bot API. Nothing real is called.

  BLOB_READ_WRITE_TOKEN= TELEGRAM_API_URL=http://127.0.0.1:8793 npx next start -p 3057 &
  (the empty token matters: .env.local holds the real Blob token and the test would write to it)
  .venv/bin/python scripts/test_webhook.py        # expects the server above
Cleans up runs/subscribers/ afterwards (so run it on a checkout without real registrations).
"""
import json
import shutil
import sys
import threading
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from engine import deliver  # noqa: E402  (loads .env: TELEGRAM_SECRET)
import os  # noqa: E402

URL, FAKE = "http://127.0.0.1:3057/api/telegram", 8793
SECRET = os.environ["TELEGRAM_SECRET"]
SUBS = ROOT / "runs" / "subscribers"
sent = []


class Fake(BaseHTTPRequestHandler):
    def do_POST(self):
        sent.append((self.path.rsplit("/", 1)[1], json.loads(self.rfile.read(int(self.headers["content-length"])))))
        self.send_response(200); self.send_header("content-type", "application/json"); self.end_headers()
        self.wfile.write(b'{"ok":true,"result":{}}')

    def log_message(self, *a):
        pass


threading.Thread(target=HTTPServer(("127.0.0.1", FAKE), Fake).serve_forever, daemon=True).start()
shutil.rmtree(SUBS, ignore_errors=True)


def post(update, secret=SECRET):
    r = urllib.request.Request(URL, data=json.dumps(update).encode(), headers={"content-type": "application/json", "x-telegram-bot-api-secret-token": secret})
    try:
        return urllib.request.urlopen(r).status
    except urllib.error.HTTPError as e:
        return e.code


def say(chat, text, typ="private"):
    return {"message": {"chat": {"id": chat, "type": typ}, "text": text, "from": {"id": chat}}}


def tap(who, data, msg_id=1):
    return {"callback_query": {"id": "cb", "data": data, "from": {"id": who, "first_name": "Rakesh", "username": "rk"},
                               "message": {"chat": {"id": who}, "message_id": msg_id}}}


def take():
    out = list(sent); sent.clear(); return out


ADMIN, MGR, STRANGER = 100, 200, 300
assert post(say(MGR, "/start"), "wrong") == 401

# no admin yet: a manager's pick cannot be routed
post(say(MGR, "/start")); kb = take()
assert kb[0][0] == "sendMessage" and len(kb[0][1]["reply_markup"]["inline_keyboard"]) == 7, kb
assert kb[0][1]["reply_markup"]["inline_keyboard"][0][0]["callback_data"] == "pick:AM-01"
post(tap(MGR, "pick:AM-01")); assert not SUBS.exists() and take()[0][0] == "answerCallbackQuery"

# admin link: bad code refused, good code accepted
post(say(ADMIN, "/start admin_deadbeef")); assert "not valid" in take()[0][1]["text"] and not (SUBS / "admin.json").exists()
post(say(ADMIN, f"/start admin_{deliver.link_code('ADMIN')}")); take()
assert json.loads((SUBS / "admin.json").read_text())["chat_id"] == ADMIN

# pick -> admin gets approve/reject; manager told to wait
post(tap(MGR, "pick:AM-01")); calls = take()
to_admin = [b for m, b in calls if m == "sendMessage" and b["chat_id"] == ADMIN][0]
assert "AM-01" in to_admin["text"] and [b["callback_data"] for b in to_admin["reply_markup"]["inline_keyboard"][0]] == [f"ok:{MGR}:AM-01", f"no:{MGR}"]
assert any(b["chat_id"] == MGR and "Waiting" in b["text"] for m, b in calls if m == "sendMessage")

# a non-admin cannot approve
post(tap(STRANGER, f"ok:{STRANGER}:AM-01")); take()
assert not (SUBS / "AM-01.json").exists()
# reject saves nothing, approve saves and notifies
post(tap(ADMIN, f"no:{MGR}")); calls = take()
assert not (SUBS / "AM-01.json").exists() and any("declined" in b["text"] for m, b in calls if m == "sendMessage")
post(tap(ADMIN, f"ok:{MGR}:AM-01", 7)); calls = take()
assert json.loads((SUBS / "AM-01.json").read_text())["chat_id"] == MGR
assert any(m == "editMessageText" and b["message_id"] == 7 for m, b in calls)
assert deliver.recipients(["AM-01"]) == {"AM-01": {"chat_id": MGR}}  # the daily delivery sees them

# personal link still works without approval; wrong manager code does not
post(say(400, f"/start AM-02_{deliver.link_code('AM-02')}")); take()
assert json.loads((SUBS / "AM-02.json").read_text())["chat_id"] == 400
post(say(401, f"/start AM-03_{deliver.link_code('AM-02')}")); take()
assert not (SUBS / "AM-03.json").exists()
# first use wins: same person again is fine, a different person is refused and the owner is unchanged
post(say(400, f"/start AM-02_{deliver.link_code('AM-02')}")); assert "Already connected" in take()[0][1]["text"]
post(say(402, f"/start AM-02_{deliver.link_code('AM-02')}")); assert "already been used" in take()[0][1]["text"]
assert json.loads((SUBS / "AM-02.json").read_text())["chat_id"] == 400
# admin reset frees the slot for the next person
from engine import store  # noqa: E402
store.delete("subscribers/AM-02.json")
post(say(402, f"/start AM-02_{deliver.link_code('AM-02')}")); take()
assert json.loads((SUBS / "AM-02.json").read_text())["chat_id"] == 402

# salesperson flow: store -> name -> approval goes to their area manager (AM-01 = MGR here), who can approve; strangers cannot
SP, SPCHAT = "SP1002", 500
post(tap(SPCHAT, "sp")); kb = take()[0][1]["reply_markup"]["inline_keyboard"]
assert kb[0][0]["callback_data"] == "st:LKO-01", kb
post(tap(SPCHAT, "st:LKO-01")); kb = take()[0][1]["reply_markup"]["inline_keyboard"]
assert f"pk:{SP}" in [r[0]["callback_data"] for r in kb], kb
post(tap(SPCHAT, f"pk:{SP}")); calls = take()
ask = [b for m, b in calls if m == "sendMessage" and b["chat_id"] == MGR][0]  # the area manager, not the admin
assert [b["callback_data"] for b in ask["reply_markup"]["inline_keyboard"][0]] == [f"ok:{SPCHAT}:{SP}", f"no:{SPCHAT}:{SP}"]
post(tap(STRANGER, f"ok:{SPCHAT}:{SP}")); take()
assert not (SUBS / f"{SP}.json").exists()
post(tap(MGR, f"ok:{SPCHAT}:{SP}")); take()
assert json.loads((SUBS / f"{SP}.json").read_text())["chat_id"] == SPCHAT
post(say(501, f"/start SP1003_{deliver.link_code('SP1003')}")); take()  # personal link, no approval
assert json.loads((SUBS / "SP1003.json").read_text())["chat_id"] == 501

# group chats are ignored; picks are rate limited
post(say(9, "/start", "group")); assert not take()
for _ in range(12):
    post(tap(MGR, "pick:AM-01"))
assert any(m == "answerCallbackQuery" and "Too many" in b.get("text", "") for m, b in take())

shutil.rmtree(SUBS, ignore_errors=True)
print("webhook ok")
