"""Small formatting helpers shared by detectors, cards and digests."""
import pandas as pd

LANG = {"Uttar Pradesh": "hi-IN", "Bihar": "hi-IN", "Karnataka": "kn-IN"}


def inr(x: float) -> str:
    x = float(x)
    if x >= 1e7:
        return f"₹{x / 1e7:.2f} Cr"
    if x >= 1e5:
        return f"₹{x / 1e5:.1f} lakh"
    if x >= 1e3:
        return f"₹{x / 1e3:.0f}k"
    return f"₹{x:.0f}"


def pct(x: float, dp: int = 0) -> str:
    return f"{x * 100:.{dp}f}%"


def names(xs) -> str:
    xs = list(xs)
    return xs[0] if len(xs) == 1 else ", ".join(xs[:-1]) + " and " + xs[-1]


def day(ts) -> str:
    return pd.Timestamp(ts).strftime("%a %-d %b")


def weekend(as_of) -> tuple[str, str]:
    """Next two weekend days from the morning after as_of. On a Sunday that is today and next Saturday."""
    today = pd.Timestamp(as_of) + pd.Timedelta(days=1)
    if today.dayofweek == 6:
        return day(today), day(today + pd.Timedelta(days=6))
    sat = today + pd.Timedelta(days=(5 - today.dayofweek) % 7)
    return day(sat), day(sat + pd.Timedelta(days=1))


def words(s: str) -> int:
    return len(s.split())
