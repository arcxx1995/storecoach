"""Daily run: python -m engine.run --as-of 2026-10-31 [--no-sarvam]  ->  runs/<date>/

Writes digests.json (area managers), cards.json (salespeople), issues.json (everything found, ranked),
followups.json, data_issues.json, metrics, and audio/*.mp3 when Sarvam is on.
"""
import argparse
import json
import time

import pandas as pd

from engine import sarvam, source, store
from engine.cards import MAX_WORDS, build_cards
from engine.detectors import detect, make_ctx
from engine.digest import briefing_text, build_digests
from engine.load import load
from engine.metrics import data_issues, repeat_metrics, salesperson_metrics, store_metrics
from engine.text import LANG

WINDOW = pd.Timedelta(days=27)
HISTORY_DAYS = 21  # cooldown is 14 days and follow-ups retry "too early" alerts, so look back further than both


def records(df: pd.DataFrame) -> list[dict]:
    return json.loads(df.reset_index().to_json(orient="records", date_format="iso", double_precision=4))


def history(E: pd.Timestamp) -> dict:
    out = {}
    for k in range(1, HISTORY_DAYS + 1):
        dt = (E - pd.Timedelta(days=k)).date().isoformat()
        dg = store.read_json(f"{dt}/digests.json")
        if dg:
            out[dt] = dg["digests"]
    return out


def localise(cards: list, digests: dict, date: str, use_sarvam: bool, voice_cards: bool = True) -> dict:
    """Hindi/Kannada text + audio. Falls back to English (no audio) per item on any failure.
    voice_cards=False: only the area-manager briefings get Sarvam (6 calls/day), cards stay English text."""
    stats = {"sarvam": use_sarvam and sarvam.enabled(), "translated": 0, "fallback_en": 0, "audio": 0}
    if not stats["sarvam"]:
        for c in cards:
            c.update(lang=LANG[c["state"]], text_local=None, audio=None)
        for dg in digests.values():
            dg.update(briefing_en=briefing_text(dg), briefing_local=None, briefing_audio=None)
            for i in dg["new_today"]:
                i["text_local"] = None
        return stats

    def card(c):
        lang = LANG[c["state"]]
        local = sarvam.translate(c["text_en"], lang, MAX_WORDS, keep=[x for x in (c["peer_name"],) if x])
        c.update(lang=lang, text_local=local, audio=None)  # audio is voiced on demand by /api/tts
        return local is not None, False

    def brief(item):
        am_id, dg = item
        dg["briefing_en"] = briefing_text(dg)
        local = sarvam.translate(dg["briefing_en"], dg["lang"])
        for i in dg["new_today"]:
            i["text_local"] = sarvam.translate(i["text_en"], dg["lang"])
        dg.update(briefing_local=local, briefing_audio=None)
        return local is not None, False

    # briefings first so a time-budget cut-off hits the cards, never the briefings
    res = sarvam.pmap(brief, list(digests.items()), workers=6, default=(False, False)) + sarvam.pmap(card, cards if voice_cards else [], default=(False, False))
    for c in cards:  # items the time budget cut off fall back to English
        c.setdefault("lang", LANG[c["state"]]); c.setdefault("text_local", None); c.setdefault("audio", None)
    for dg in digests.values():
        dg.setdefault("briefing_en", briefing_text(dg)); dg.setdefault("briefing_local", None); dg.setdefault("briefing_audio", None)
        for i in dg["new_today"]:
            i.setdefault("text_local", None)
    for ok, has_audio in res:
        stats["translated" if ok else "fallback_en"] += 1
        stats["audio"] += has_audio
    return stats


def run(as_of=None, use_sarvam=True, budget=None, voice_cards=None) -> str:
    """budget: seconds Sarvam may use before the rest falls back to English (the cron passes what is left of its limit).
    use_sarvam: voice the AM briefings. voice_cards: also voice the ~126 salesperson cards (default: same as use_sarvam)."""
    voice_cards = use_sarvam if voice_cards is None else voice_cards
    t0 = time.time()
    sarvam.DEADLINE = t0 + budget if budget else 0.0
    d = load(as_of)
    E = d.as_of
    date = E.date().isoformat()
    ctx = make_ctx(d)

    issues = detect(ctx)
    dq = data_issues(d)
    digests, followups = build_digests(ctx, issues, dq, history(E))
    cards = build_cards(ctx, issues)
    stats = localise(cards, digests, date, use_sarvam, voice_cards)

    start = E - WINDOW
    c_end, c_start = E - pd.Timedelta(days=30), E - pd.Timedelta(days=395)
    meta = {"as_of": date, "today": (E + pd.Timedelta(days=1)).date().isoformat(), "data_ends": source.data_end().date().isoformat(),
            "window": [start.date().isoformat(), date], "issues_found": len(issues), "cards": len(cards), **stats,
            "health": {"seconds": round(time.time() - t0, 1), "source": "live" if source.live() else "csv",
                       "sarvam_cut_off": bool(sarvam.DEADLINE and time.time() > sarvam.DEADLINE)}}
    store.write_json(f"{date}/issues.json", {"meta": meta, "issues": issues})
    store.write_json(f"{date}/digests.json", {"meta": meta, "digests": digests})
    store.write_json(f"{date}/cards.json", {"meta": meta, "cards": cards})
    store.write_json(f"{date}/followups.json", {"meta": meta, "followups": followups})
    store.write_json(f"{date}/data_issues.json", {"meta": meta, "rows": dq})
    store.write_json(f"{date}/store_metrics.json", {"meta": meta, "rows": records(
        store_metrics(d, start, E).join(repeat_metrics(d, c_start, c_end)))})
    store.write_json(f"{date}/salesperson_metrics.json", {"meta": meta, "rows": records(
        salesperson_metrics(d, start, E).join(repeat_metrics(d, c_start, c_end, "salesperson_id")))})
    dates = sorted(set(store.run_dates()) | {date})  # Blob index is read-modify-write, so add today explicitly
    active = set(d.bills[d.bills.bill_date > E - pd.Timedelta(days=30)].salesperson_id)  # leavers stay out of the sign-up picker
    store.write_json("roster.json", {  # read by the Telegram sign-up flow (app/api/telegram/route.ts)
        "stores": {r.store_id: {"city": r.city, "am_id": r.area_manager_id} for r in d.stores.itertuples()},
        "salespeople": [{"id": r.salesperson_id, "name": r.name, "store_id": r.store_id}
                        for r in d.salespeople.itertuples() if r.salesperson_id in active]})
    store.write_json("index.json", {"dates": dates, "latest": dates[-1]})
    return date


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--as-of", default=None, help="YYYY-MM-DD, default: last day the data covers")
    p.add_argument("--no-sarvam", action="store_true")
    a = p.parse_args()
    print(run(a.as_of, use_sarvam=not a.no_sarvam))
