"""Where the input tables come from: ./data CSVs (default) or a live REST API mirrored into a snapshot.

Live contract. Set LIVE_API_URL (and optionally LIVE_API_TOKEN, sent as a Bearer token):
  GET {url}/<table>?since=YYYY-MM-DD  ->  JSON array of row objects, or CSV, with the same columns as data/<table>.csv
  transactional (honour `since`): bills, bill_lines (lines of bills dated >= since), footfall_daily, roster_daily
  masters (always the full table): stores, items, calendar, salespeople, area_managers
Publish only complete days: a day counts as ready when both bills and footfall_daily reach it.

sync() pulls into snapshot/<table>.csv in the run store (local folder or Blob), re-fetching the last
OVERLAP_DAYS so late corrections land. load.read() then reads the snapshot, so a run never calls the API itself.
"""
import io
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

import pandas as pd

from engine import store

DATA_DIR = Path(os.environ.get("STORECOACH_DATA", Path(__file__).resolve().parent.parent / "data"))
MASTERS = ["stores", "items", "calendar", "salespeople", "area_managers"]
KEYS = {"bills": ["bill_id"], "footfall_daily": ["date", "store_id"],
        "roster_daily": ["date", "store_id", "salesperson_id"]}
DATE_COL = {"bills": "bill_date", "footfall_daily": "date", "roster_daily": "date"}
OVERLAP_DAYS = 3


def live() -> bool:
    return bool(os.environ.get("LIVE_API_URL"))


def _csv(b: bytes) -> pd.DataFrame:
    return pd.read_csv(io.BytesIO(b), dtype=str, keep_default_na=False)


def _get(table: str, since: str | None = None) -> pd.DataFrame:
    url = f"{os.environ['LIVE_API_URL'].rstrip('/')}/{table}" + (f"?since={since}" if since else "")
    tok = os.environ.get("LIVE_API_TOKEN")
    req = urllib.request.Request(url, headers={"authorization": f"Bearer {tok}"} if tok else {})
    for k in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                body, ctype = r.read(), r.headers.get("content-type", "")
            break
        except (urllib.error.URLError, TimeoutError):
            if k == 2:
                raise
            time.sleep(2 ** k)
    if "json" in ctype:
        rows = json.loads(body)
        return pd.DataFrame(rows).fillna("").astype(str) if rows else pd.DataFrame()
    return _csv(body)


def _old(table: str) -> pd.DataFrame:
    b = store.read_bytes(f"snapshot/{table}.csv")
    return _csv(b) if b else pd.DataFrame()


def _save(table: str, df: pd.DataFrame) -> None:
    store.write_bytes(f"snapshot/{table}.csv", df.to_csv(index=False).encode())


def _since(old: pd.DataFrame, col: str) -> str | None:
    if old.empty:
        return None  # first sync: full history
    return (pd.to_datetime(old[col]).max() - pd.Timedelta(days=OVERLAP_DAYS)).date().isoformat()


def _merge(old: pd.DataFrame, new: pd.DataFrame, key: list) -> pd.DataFrame:
    return pd.concat([old, new]).drop_duplicates(key, keep="last") if len(old) else new


def sync() -> dict:
    """Pull new rows from the live API into the snapshot. No-op for CSV mode. Returns rows fetched per table."""
    if not live():
        return {}
    got = {}
    for m in MASTERS:
        df = _get(m)
        _save(m, df)
        got[m] = len(df)
    old_bills = _old("bills")
    since = _since(old_bills, "bill_date")
    new_bills = _get("bills", since)
    new_lines = _get("bill_lines", since)
    old_lines = _old("bill_lines")
    if len(old_lines) and len(new_lines):  # a bill's lines are replaced as a set
        old_lines = old_lines[~old_lines.bill_id.isin(new_lines.bill_id)]
    _save("bills", _merge(old_bills, new_bills, KEYS["bills"]))
    _save("bill_lines", pd.concat([old_lines, new_lines]) if len(old_lines) else new_lines)
    got["bills"], got["bill_lines"] = len(new_bills), len(new_lines)
    for t in ("footfall_daily", "roster_daily"):
        old = _old(t)
        new = _get(t, _since(old, DATE_COL[t]))
        _save(t, _merge(old, new, KEYS[t]))
        got[t] = len(new)
    return got


def table(name: str) -> pd.DataFrame:
    if not live():
        return pd.read_csv(DATA_DIR / f"{name}.csv", dtype=str, keep_default_na=False)
    b = store.read_bytes(f"snapshot/{name}.csv")
    if b is None:
        raise RuntimeError(f"no snapshot for {name}: run engine.source.sync() first")
    return _csv(b)


def data_end() -> pd.Timestamp:
    """Last day with both bills and footfall."""
    return min(pd.to_datetime(table("bills").bill_date).max(), pd.to_datetime(table("footfall_daily").date).max())
