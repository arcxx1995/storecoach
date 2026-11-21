"""Telegram setup helper (needs TELEGRAM_BOT_TOKEN and TELEGRAM_SECRET in env or .env).
  --whoami                 check the bot token, print the bot link
  --webhook https://APP    point the bot at APP/api/telegram (the app does this itself on a production deploy; manual fallback)
  --links                  print the shared bot link for managers, your one-time admin link, and optional personal links
  --sp-links               print a personal link for every employee, area managers and salespeople (CSV: id,name,store_or_city,link)
  --status                 who has registered (managers, and a count of salespeople)
  --reset AM-01            free a manager's slot (links are first-use-wins) so the link can be used again
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
p.add_argument("--sp-links", action="store_true")
p.add_argument("--status", action="store_true")
p.add_argument("--reset", help="free a manager's slot so their link can be used again, e.g. --reset AM-01")
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
                        "allowed_updates": ["message", "callback_query"]})
    print("Webhook set:", call("getWebhookInfo")["url"])
if a.links:
    print(f"Managers: share https://t.me/{me['username']}  (they tap their name; you approve in Telegram)")
    print(f"Admin (open once, press Start):  https://t.me/{me['username']}?start=admin_{deliver.link_code('ADMIN')}\n")
    print("Optional personal links (connect without approval):")
    for am, name, city in managers():
        print(f"{am}  {name} ({city})\n  https://t.me/{me['username']}?start={am}_{deliver.link_code(am)}")
if a.sp_links:
    print("id,name,store_or_city,link")
    for am, name, city in managers():
        print(f"{am},{name},{city},https://t.me/{me['username']}?start={am}_{deliver.link_code(am)}")
    for r in store.read_json("roster.json")["salespeople"]:
        print(f"{r['id']},{r['name']},{r['store_id']},https://t.me/{me['username']}?start={r['id']}_{deliver.link_code(r['id'])}")
if a.status:
    wh = call("getWebhookInfo").get("url") or "NOT SET (deploy to production, or run --webhook)"
    print(f"Webhook: {wh}")
    print("Admin:   " + ("registered" if store.read_json("subscribers/admin.json") else "not yet (open the admin link)"))
    reg = deliver.recipients([m[0] for m in managers()])
    for am, name, city in managers():
        print(f"{am}  {name:<22} {'registered' if am in reg else 'not yet'}")
    sps = [r["id"] for r in store.read_json("roster.json")["salespeople"]]
    print(f"Salespeople registered: {len(deliver.recipients(sps))} of {len(sps)}")
if a.reset:
    store.delete(f"subscribers/{a.reset}.json")
    print(f"{a.reset} reset: their personal link works again (the next person to use it keeps it).")
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
