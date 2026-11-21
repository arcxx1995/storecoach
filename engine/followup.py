"""A week after an alert, re-measure its number and say whether it moved."""
import pandas as pd

from engine.load import Data
from engine.metrics import attendance, window

DAY = pd.Timedelta(days=1)
MIN_N = {"conversion": 100, "busy_conversion": 50, "attach": 5, "mix": 20, "discount_pct": 10,
         "returning_share": 15, "busy_off_rate": 2}
LABEL = {"conversion": "conversion", "busy_conversion": "busy-day conversion", "attach": "attach rate",
         "mix": "share of bills", "discount_pct": "discount off MRP", "returning_share": "bills from returning customers"}


def measure(d: Data, t: dict, start, end):
    """(value, sample size) for a track spec over [start, end]."""
    m, ids = t["metric"], t["ids"]
    if m in ("conversion", "busy_conversion"):
        sd = window(d.store_day, "date", start, end)
        sd = sd[sd.valid & sd.store_id.isin(ids)]
        if m == "busy_conversion":
            sd = sd[sd.weekend | (sd.is_wedding_date == 1)]
        ff = sd.footfall.sum()
        return (sd.bills.sum() / ff if ff else None), int(ff)
    if m == "busy_off_rate":
        a = attendance(d, start, end)
        a = a[a.index.isin(ids)]
        n = int(a.busy_days.sum())
        return (a.busy_off_days.sum() / n if n else None), n
    b = window(d.bills, "bill_date", start, end)
    b = b[b[t["scope"]].isin(ids)]
    if m == "attach":
        b = b[b[t["anchor"]]]
        return (b[t["col"]].mean() if len(b) else None), len(b)
    if m == "mix":
        return (b[t["col"]].mean() if len(b) else None), len(b)
    if m == "discount_pct":
        mv = b.mrp_value.sum()
        return (b.discount.sum() / mv if mv else None), len(b)
    if m == "returning_share":
        k = b[b.known_customer]
        return (k.returning.mean() if len(k) else None), len(k)
    raise ValueError(m)


def check(d: Data, alert: dict, alert_date) -> dict:
    """Before = the metric's own window ending on alert day; after = every day since (7 on the first check).

    A salesperson sells a few sherwanis a week, so a fixed 7-day window would stay "too early" forever;
    growing it to today lets a retry the next day see more bills.
    """
    t, A = alert["track"], pd.Timestamp(alert_date)
    wd = t.get("window_days", 28)
    days = (d.as_of - A).days
    before, _ = measure(d, t, A - (wd - 1) * DAY, A)
    after, n = measure(d, t, A + DAY, d.as_of)
    out = {"key": alert["key"], "title": alert["title"], "am_id": alert["am_id"], "alerted_on": A.date().isoformat(),
           "metric": LABEL.get(t["metric"], t["metric"]), "before": before, "after": after, "sample": n, "days": days}
    if before is None or after is None or n < MIN_N.get(t["metric"], 10):
        return {**out, "status": "too_early", "summary": f"{alert['title']}: too few "
                f"{'walk-ins' if 'conversion' in t['metric'] else 'bills'} in {days} days to tell ({n})."}
    sign = 1 if t["better"] == "up" else -1
    move = sign * (after - before)
    # Moved 10% of its own level (or 1 point) in the right direction counts as a real move.
    thresh = max(0.1 * abs(before), 0.01)
    status = "improved" if move >= thresh else "worse" if move <= -thresh else "flat"
    word = {"improved": "improved", "worse": "got worse", "flat": "has not moved"}[status]
    fmt = lambda v: f"{v * 100:.1f}%"
    return {**out, "status": status,
            "summary": f"{alert['title']}: {out['metric']} {word}, {fmt(before)} → {fmt(after)} in the {days} days since."}
