"""Send each area manager's digest on Telegram: one text message, then the voice briefing as audio.

Env: TELEGRAM_BOT_TOKEN, TELEGRAM_SECRET (webhook auth + personal links), optional DELIVERY_RECIPIENTS='{"AM-01": {"chat_id": 123456}}' override, APP_URL (public https, for the
"Open dashboard" button), DELIVERY_DRY_RUN=1 (print instead of send), TELEGRAM_API_URL (tests).
A bot cannot message first: each manager presses Start on their personal link (scripts/telegram_setup.py --links); the webhook
in app/api/telegram/route.ts then saves their chat_id as subscribers/<am>.json.
Status per manager goes to <date>/delivered.json; managers already "ok" are skipped, so reruns never double-send.
"""
import hashlib
import hmac
import html
import json
import os
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone

from engine import sarvam, store  # noqa: F401  (sarvam import loads .env)

LIMIT = 4096
MAX_ISSUES = 3
API = os.environ.get("TELEGRAM_API_URL", "https://api.telegram.org")


def link_code(am_id: str) -> str:
    """Personal-link code. Must match codeFor() in app/api/telegram/route.ts."""
    key = ("link:" + os.environ["TELEGRAM_SECRET"]).encode()
    return hmac.new(key, am_id.encode(), hashlib.sha256).hexdigest()[:16]


def recipients(am_ids=()) -> dict:
    """Managers who pressed Start on their link (subscribers/<am>.json), overridden by env DELIVERY_RECIPIENTS."""
    out = {}
    for am in am_ids:
        sub = store.read_json(f"subscribers/{am}.json")
        if sub and sub.get("chat_id"):
            out[am] = {"chat_id": sub["chat_id"]}
    return out | json.loads(os.environ.get("DELIVERY_RECIPIENTS") or "{}")


def _inr(x: float) -> str:
    return (f"₹{x / 1e7:.2f} Cr" if x >= 1e7 else f"₹{x / 1e5:.1f} lakh" if x >= 1e5
            else f"₹{round(x / 1e3)}k" if x >= 1e3 else f"₹{round(x)}")


def format_message(dg: dict, date: str, app_url: str | None = None) -> str:
    e = html.escape
    first = dg["name"].split()[0]
    new = dg["new_today"]
    moved = [f for f in dg["followups"] if f["status"] != "too_early"]
    out = [f"<b>Good morning {e(first)}</b>"]
    local = dg.get("briefing_local")
    if local:
        out.append(e(local))
    if not new and not moved:
        out.append(("\n" if local else "") + e(f"All clear for {dg['city']}: no new issues today."))
    for n, i in enumerate(new[:MAX_ISSUES], 1):
        a = i["action"]
        out.append(f"\n<b>{n}. {e(i['title'])}</b>\n{_inr(i['rupees'])} at stake per 4 weeks\n"
                   f"Who: {e(a['who'])}\nWhat: {e(a['what'])}\nWhen: {e(a['when'])}")
    if len(new) > MAX_ISSUES:
        out.append(f"\n+{len(new) - MAX_ISSUES} more in the dashboard.")
    if moved:
        out.append("\n<b>Last week's alerts</b>\n" + "\n".join(e(f["summary"]) for f in moved))
    text = "\n".join(out).strip()
    if len(text) > LIMIT:
        text = text[: LIMIT - 40].rsplit("\n", 1)[0] + "\n…more in the dashboard."
    return text


class Blocked(Exception):
    """Manager blocked the bot or never pressed Start: retrying will not help."""


def _call(method: str, body: bytes, ctype: str) -> dict:
    token = os.environ["TELEGRAM_BOT_TOKEN"]
    req = urllib.request.Request(f"{API}/bot{token}/{method}", data=body, headers={"content-type": ctype})
    for k in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            info = {}
            try:
                info = json.load(e)
            except Exception:
                pass
            if e.code in (400, 403):
                if e.code == 403 or "chat not found" in str(info.get("description", "")):
                    raise Blocked(info.get("description", "forbidden"))
                raise RuntimeError(info.get("description", f"HTTP {e.code}"))
            if e.code == 429 and k < 2:
                time.sleep(min(30, info.get("parameters", {}).get("retry_after", 2)))
                continue
            if e.code >= 500 and k < 2:
                time.sleep(2 ** k)
                continue
            raise RuntimeError(info.get("description", f"HTTP {e.code}"))
    raise RuntimeError("telegram: gave up")


def send_text(chat_id, text: str, button_url: str | None = None) -> None:
    body = {"chat_id": chat_id, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True}
    if button_url:
        body["reply_markup"] = {"inline_keyboard": [[{"text": "Open dashboard", "url": button_url}]]}
    _call("sendMessage", json.dumps(body).encode(), "application/json")


def send_audio(chat_id, data: bytes, filename: str, title: str) -> None:
    b = uuid.uuid4().hex
    parts = []
    for k, v in (("chat_id", str(chat_id)), ("title", title)):
        parts.append(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    parts.append(f'--{b}\r\nContent-Disposition: form-data; name="audio"; filename="{filename}"\r\n'
                 "Content-Type: audio/mpeg\r\n\r\n".encode() + data + b"\r\n")
    parts.append(f"--{b}--\r\n".encode())
    _call("sendAudio", b"".join(parts), f"multipart/form-data; boundary={b}")


def deliver(date: str, resend: bool = False) -> dict:
    """Send the digests of `date`. Returns {"ok": [...], "failed": {...}, "skipped": [...]}."""
    dg = (store.read_json(f"{date}/digests.json") or {}).get("digests", {})
    done = store.read_json(f"{date}/delivered.json") or {}
    dry = bool(os.environ.get("DELIVERY_DRY_RUN"))
    app = os.environ.get("APP_URL")
    link = lambda am: f"{app.rstrip('/')}/am/{am}?to={date}" if app and app.startswith("https://") else None  # noqa: E731
    to = recipients(dg)
    res = {"ok": [], "failed": {}, "skipped": []}
    for am_id, d in dg.items():
        if not resend and done.get(am_id, {}).get("status") == "ok":
            res["skipped"].append(am_id)
            continue
        chat = (to.get(am_id) or {}).get("chat_id")
        if not chat:
            res["skipped"].append(am_id)  # no recipient configured: not an error
            continue
        text = format_message(d, date, app)
        try:
            if dry:
                print(f"--- {am_id} -> {chat}\n{text}\n[audio: {d.get('briefing_audio')}] [button: {link(am_id)}]")
            else:
                send_text(chat, text, link(am_id))
                audio = d.get("briefing_audio") and store.read_bytes(d["briefing_audio"])
                if audio:
                    send_audio(chat, audio, f"briefing_{am_id}.mp3", f"Store Coach · {d['city']}")
            done[am_id] = {"status": "ok", "at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "dry": dry}
            res["ok"].append(am_id)
        except Exception as e:  # one manager failing never blocks the rest
            done[am_id] = {"status": "failed", "at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "error": str(e)}
            res["failed"][am_id] = str(e)
    if not dry:
        store.write_json(f"{date}/delivered.json", done)
    return res
