"""Telegram setup helper (needs TELEGRAM_BOT_TOKEN and TELEGRAM_SECRET in env or .env).
  --whoami                 check the bot token, print the bot link
  --webhook https://APP    point the bot at APP/api/telegram (run once after deploying; managers register through it)
  --links                  print each manager's personal Start link: send each one to that manager only
  --status                 who has registered
  --test AM-01             send a hello to that manager
  --ids                    legacy: list chat ids of people who pressed Start (only works while NO webhook is set)
"""
import argparse
import csv
import json
import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from engine import deliver, store  # noqa: E402  (also loads .env)


def call(method, body=None):
    url = f"{deliver.API}/bot{os.environ['TELEGRAM_BOT_TOKEN']}/{method}"
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body else None,
                                 headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)["result"]


def managers():
    rows = csv.DictReader(open(Path(os.environ.get("STORECOACH_DATA", ROOT / "data")) / "area_managers.csv"))
    return [(r["area_manager_id"], r["name"], r["city"]) for r in rows]


p = argparse.ArgumentParser()
p.add_argument("--whoami", action="store_true")
p.add_argument("--webhook")
p.add_argument("--links", action="store_true")
p.add_argument("--status", action="store_true")
p.add_argument("--test")
p.add_argument("--ids", action="store_true")
a = p.parse_args()
for k in ("TELEGRAM_BOT_TOKEN", "TELEGRAM_SECRET"):
    if not os.environ.get(k):
        sys.exit(f"Set {k} (bot token: create a bot with @BotFather; secret: any long random string, A-Z a-z 0-9 _ -).")

me = call("getMe")
if a.whoami:
    print(f"Bot: @{me['username']}  ->  https://t.me/{me['username']}")
if a.webhook:
    call("setWebhook", {"url": a.webhook.rstrip("/") + "/api/telegram", "secret_token": os.environ["TELEGRAM_SECRET"],
                        "allowed_updates": ["message"]})
    print("Webhook set:", call("getWebhookInfo")["url"])
if a.links:
    for am, name, city in managers():
        print(f"{am}  {name} ({city})\n  https://t.me/{me['username']}?start={am}_{deliver.link_code(am)}")
if a.status:
    reg = deliver.recipients([m[0] for m in managers()])
    for am, name, city in managers():
        print(f"{am}  {name:<22} {'registered' if am in reg else 'not yet'}")
if a.test:
    chat = (deliver.recipients([a.test]).get(a.test) or {}).get("chat_id")
    if not chat:
        sys.exit(f"{a.test} has not registered yet.")
    deliver.send_text(chat, "<b>Store Coach is connected.</b>\nYou will get your morning briefing here.")
    print("sent")
if a.ids:
    seen = {}
    for u in call("getUpdates"):
        m = u.get("message") or {}
        if m.get("chat", {}).get("type") == "private":
            seen[m["chat"]["id"]] = m["chat"].get("first_name", "")
    print("\n".join(f"{c}  {n}" for c, n in seen.items()) or "Nobody yet.")
