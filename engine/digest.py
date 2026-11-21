"""Area-manager digests: rank by ₹, cap at max_alerts_per_week (rolling 7 days), cooldown, follow-ups."""
import pandas as pd

from engine.detectors import Ctx, role_models
from engine.followup import check
from engine.text import LANG, day, inr

COOLDOWN_DAYS = 14
MONTH = 30.4 / 28  # engine ₹ are per 4 weeks; people see per month
MIN_RUPEES = 5000  # per 4 weeks; smaller gaps still coach the salesperson via their card, not the AM


def issue_text(i: dict) -> str:
    a = i["action"]
    return (f"{i['title']}. Cause: {i['cause']} Action for {a['who']}: {a['what']}, {a['when']}. "
            f"At stake: {inr(i['rupees'] * MONTH)} per month.")


def build_digests(ctx: Ctx, issues: list, data_issues: list, history: dict) -> tuple[dict, list]:
    """history: {date_str: digests_dict} for previous runs. Returns (digests by AM, follow-ups)."""
    d, E = ctx.d, ctx.E
    notes = {}  # dummy-number notes stay in data_issues.json; the brief says data issues never reach the AM
    models = role_models(ctx)
    followups = []
    week_ago = (E - pd.Timedelta(days=7)).date().isoformat()
    digests = {}
    for am_id, am in ctx.ams.iterrows():
        sent = [(dt, i) for dt, dg in history.items() for i in dg.get(am_id, {}).get("new_today", [])]
        this_week = [(dt, i) for dt, i in sent if pd.Timestamp(dt) > E - pd.Timedelta(days=7)]
        recent = {i["key"] for dt, i in sent if pd.Timestamp(dt) > E - pd.Timedelta(days=COOLDOWN_DAYS)}
        slots = max(0, int(am.max_alerts_per_week) - len(this_week))
        mine = [i for i in issues if i["am_id"] == am_id and i["key"] not in recent and i["rupees"] >= MIN_RUPEES]
        new = [{k: v for k, v in i.items() if k != "cards"} | {"text_en": issue_text(i)} for i in mine[:slots]]
        # Any alert at least 7 days old and not yet measured. "Too early" is said once, on day 7; after that the
        # check retries quietly each day (its window grows) and reports only once it can tell.
        # ponytail: if the day-7 run is missed, a never-measurable alert is never mentioned; fine for a daily cron.
        done = {(f["key"], f["alerted_on"]) for dg in history.values()
                for f in dg.get(am_id, {}).get("followups", []) if f["status"] != "too_early"}
        fu = [f for dt, i in sent if dt <= week_ago and (i["key"], dt) not in done
              for f in [check(d, i, dt)] if f["status"] != "too_early" or dt == week_ago]
        followups += fu
        state = ctx.stores[ctx.stores.area_manager_id == am_id].state.iat[0]
        digests[am_id] = {
            "am_id": am_id, "name": am["name"], "city": am.city, "lang": LANG[state],
            "as_of": E.date().isoformat(), "max_per_week": int(am.max_alerts_per_week),
            "new_today": new,
            "earlier_this_week": [{"sent_on": dt, **i} for dt, i in this_week],
            "held_back": len(mine) - len(new),  # found but over the weekly cap; still in issues.json
            "followups": fu,
            "role_models": [m for m in models if m["am_id"] == am_id],
            "notes": notes.get(am_id, []),
        }
    return digests, followups


def briefing_text(dg: dict) -> str:
    """~60-second spoken version of the digest."""
    first = dg["name"].split()[0]
    parts = [f"Good morning {first}. Store Coach for {day(pd.Timestamp(dg['as_of']) + pd.Timedelta(days=1))}."]
    if dg["new_today"]:
        parts.append(f"{len(dg['new_today'])} new {'issue' if len(dg['new_today']) == 1 else 'issues'} today.")
        for n, i in enumerate(dg["new_today"], 1):
            parts.append(f"{n}. {i['title']}. {i['action']['what']}, {i['action']['when']}. "
                         f"{inr(i['rupees'] * MONTH)} at stake.")
    else:
        parts.append("No new issues today.")
    moved = [f for f in dg["followups"] if f["status"] != "too_early"]
    if moved:
        parts.append("Last week's alerts: " + " ".join(f["summary"] for f in moved))
    for m in dg["role_models"][:1]:
        parts.append(f"Role model: {m['name']} at {m['store_id']}; {m['repeat_rate'] * 100:.0f}% of their "
                     f"customers come back.")
    return " ".join(parts)
