"""Daily run: python -m engine.run --as-of 2026-10-31 [--no-sarvam]  ->  runs/<date>/

Writes digests.json (area managers), cards.json (salespeople), issues.json (everything found, ranked),
followups.json, data_issues.json, metrics, and audio/*.mp3 when Sarvam is on.
"""
import argparse
import json

import pandas as pd

from engine import sarvam, store
from engine.cards import MAX_WORDS, build_cards
from engine.detectors import detect, make_ctx
from engine.digest import briefing_text, build_digests
from engine.load import LAST_DAY, load
from engine.metrics import data_issues, repeat_metrics, salesperson_metrics, store_metrics
from engine.text import LANG

WINDOW = pd.Timedelta(days=27)


def records(df: pd.DataFrame) -> list[dict]:
    return json.loads(df.reset_index().to_json(orient="records", date_format="iso", double_precision=4))


def history(E: pd.Timestamp) -> dict:
    out = {}
    for k in range(1, 14):
        dt = (E - pd.Timedelta(days=k)).date().isoformat()
        dg = store.read_json(f"{dt}/digests.json")
        if dg:
            out[dt] = dg["digests"]
    return out


def localise(cards: list, digests: dict, date: str, use_sarvam: bool) -> dict:
    """Hindi/Kannada text + audio. Falls back to English (no audio) per item on any failure."""
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
        audio = sarvam.tts(local or c["text_en"], lang if local else "en-IN")
        path = f"{date}/audio/card_{c['salesperson_id']}.mp3" if audio else None
        if audio:
            store.write_bytes(path, audio)
        c.update(lang=lang, text_local=local, audio=path)
        return local is not None, audio is not None

    def brief(item):
        am_id, dg = item
        dg["briefing_en"] = briefing_text(dg)
        local = sarvam.translate(dg["briefing_en"], dg["lang"])
        for i in dg["new_today"]:
            i["text_local"] = sarvam.translate(i["text_en"], dg["lang"])
        audio = sarvam.tts(local or dg["briefing_en"], dg["lang"] if local else "en-IN")
        path = f"{date}/audio/briefing_{am_id}.mp3" if audio else None
        if audio:
            store.write_bytes(path, audio)
        dg.update(briefing_local=local, briefing_audio=path)
        return local is not None, audio is not None

    for ok, has_audio in sarvam.pmap(card, cards) + sarvam.pmap(brief, list(digests.items()), workers=6):
        stats["translated" if ok else "fallback_en"] += 1
        stats["audio"] += has_audio
    return stats


def run(as_of=None, use_sarvam=True) -> str:
    d = load(as_of)
    E = d.as_of
    date = E.date().isoformat()
    ctx = make_ctx(d)

    issues = detect(ctx)
    dq = data_issues(d)
    digests, followups = build_digests(ctx, issues, dq, history(E))
    cards = build_cards(ctx, issues)
    stats = localise(cards, digests, date, use_sarvam)

    start = E - WINDOW
    c_end, c_start = E - pd.Timedelta(days=30), E - pd.Timedelta(days=395)
    meta = {"as_of": date, "today": (E + pd.Timedelta(days=1)).date().isoformat(), "data_ends": LAST_DAY.date().isoformat(),
            "window": [start.date().isoformat(), date], "issues_found": len(issues), "cards": len(cards), **stats}
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
    store.write_json("index.json", {"dates": dates, "latest": dates[-1]})
    return date


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--as-of", default=None, help="YYYY-MM-DD, default 2026-10-31")
    p.add_argument("--no-sarvam", action="store_true")
    a = p.parse_args()
    print(run(a.as_of, use_sarvam=not a.no_sarvam))
