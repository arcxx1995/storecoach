"""Fake live API that replays data/*.csv, for testing the daily run offline.

python scripts/mock_api.py --through 2026-10-10 [--port 8765]
  GET /<table>?since=YYYY-MM-DD   rows dated >= since and <= the visible day (masters: all rows)
  GET /__through?date=YYYY-MM-DD  reveal more days (simulates a new day arriving)
Then:  LIVE_API_URL=http://localhost:8765 python -m engine.run
"""
import argparse
import io
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pandas as pd

DATA = Path(__file__).resolve().parent.parent / "data"
DATE_COL = {"bills": "bill_date", "footfall_daily": "date", "roster_daily": "date"}
TABLES = ["bills", "bill_lines", "footfall_daily", "roster_daily", "stores", "items", "calendar", "salespeople", "area_managers"]


def make(through: str):
    state = {"through": through}
    bills = pd.read_csv(DATA / "bills.csv", dtype=str, keep_default_na=False)
    bill_day = dict(zip(bills.bill_id, bills.bill_date))

    def rows(table: str, since: str | None) -> pd.DataFrame:
        df = pd.read_csv(DATA / f"{table}.csv", dtype=str, keep_default_na=False)
        day = df[DATE_COL[table]] if table in DATE_COL else df.bill_id.map(bill_day) if table == "bill_lines" else None
        if day is None:
            return df
        keep = day <= state["through"]
        return df[keep & (day >= since)] if since else df[keep]

    class H(BaseHTTPRequestHandler):
        def do_GET(self):
            u, q = urlparse(self.path), parse_qs(urlparse(self.path).query)
            if u.path == "/__through":
                state["through"] = q["date"][0]
                return self._send(200, state["through"].encode(), "text/plain")
            t = u.path.strip("/")
            if t not in TABLES:
                return self._send(404, b"unknown table", "text/plain")
            buf = io.StringIO()
            rows(t, q.get("since", [None])[0]).to_csv(buf, index=False)
            self._send(200, buf.getvalue().encode(), "text/csv")

        def _send(self, code, body, ctype):
            self.send_response(code)
            self.send_header("content-type", ctype)
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *a):
            pass

    return H


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--through", required=True)
    p.add_argument("--port", type=int, default=8765)
    a = p.parse_args()
    HTTPServer(("127.0.0.1", a.port), make(a.through)).serve_forever()
