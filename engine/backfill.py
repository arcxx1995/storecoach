"""Replay daily runs in order so weekly caps and follow-ups build up like they would live.

python -m engine.backfill --start 2026-10-01 --end 2026-10-31 [--sarvam-days 1]
AM briefings are voiced every day (6 Sarvam calls); salesperson cards only on the last N days (~130 calls per day).
"""
import argparse

import pandas as pd

from engine.run import run

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--start", default="2026-10-01")
    p.add_argument("--end", default="2026-10-31")
    p.add_argument("--sarvam-days", type=int, default=1)
    a = p.parse_args()
    days = pd.date_range(a.start, a.end)
    for n, dt in enumerate(days):
        print(run(dt, use_sarvam=True, voice_cards=n >= len(days) - a.sarvam_days))
