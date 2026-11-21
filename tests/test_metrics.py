"""Spot-check engine numbers against raw CSV maths. Run: python tests/test_metrics.py"""
import csv
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from engine.load import DATA_DIR, load  # noqa: E402
from engine.metrics import customer_firsts, data_issues, store_metrics  # noqa: E402

AS_OF = "2026-10-15"


def raw(name):
    with open(DATA_DIR / f"{name}.csv") as f:
        return list(csv.DictReader(f))


def main():
    d = load(AS_OF)
    assert d.bills.bill_date.max() <= pd.Timestamp(AS_OF)

    # Revenue and item counts recomputed with plain csv, independent of pandas joins.
    dates = {b["bill_id"]: b["bill_date"] for b in raw("bills") if b["bill_date"] <= AS_OF}
    pack = {i["sku_id"] for i in raw("items") if i["is_packaging"] == "1"}
    rev = items = 0
    for ln in raw("bill_lines"):
        if ln["bill_id"] in dates:
            rev += int(ln["qty"]) * float(ln["selling_price"])
            items += int(ln["qty"]) * (ln["sku_id"] not in pack)
    assert len(d.bills) == len(dates), (len(d.bills), len(dates))
    assert abs(d.bills.revenue.sum() - rev) < 1, (d.bills.revenue.sum(), rev)
    assert d.bills["items"].sum() == items, (d.bills["items"].sum(), items)

    # Conversion for one store-month by hand.
    s, e = "2026-09-01", "2026-09-30"
    ff = sum(int(r["footfall"]) for r in raw("footfall_daily") if r["store_id"] == "LKO-01" and s <= r["date"] <= e)
    nb = sum(1 for b in raw("bills") if b["store_id"] == "LKO-01" and s <= b["bill_date"] <= e)
    got = store_metrics(d, s, e).loc["LKO-01", "conversion"]
    assert abs(got - nb / ff) < 1e-9, (got, nb / ff)

    # Known data issues are quarantined.
    kinds = {(i["type"], i.get("store_id")) for i in data_issues(load())}
    assert ("footfall_zero_with_bills", "PAT-03") in kinds
    assert ("new_store_no_baseline", "BLR-05") in kinds
    assert ("placeholder_customer_id", "PAT-02") in kinds
    assert not d.bills[d.bills.customer_id == "C99999999"].returning.any()

    # Repeat rule: 30+ days after first bill counts; 29 days doesn't; recent first bill not eligible.
    b = pd.DataFrame({
        "bill_id": ["1", "2", "3", "4", "5"],
        "customer_id": ["A", "A", "B", "B", "C"],
        "bill_date": pd.to_datetime(["2026-01-01", "2026-01-31", "2026-01-01", "2026-01-30", "2026-10-20"]),
        "store_id": "X", "salesperson_id": "S",
    })
    f = customer_firsts(b, "2026-10-31")
    assert f.loc["A", "repeat"] and not f.loc["B", "repeat"]
    assert f.loc["A", "eligible"] and not f.loc["C", "eligible"]

    # Returning flag on real bills agrees with the cohort rule.
    first = d.bills.groupby("customer_id").bill_date.transform("min")
    expect = d.bills.known_customer & (d.bills.bill_date - first >= pd.Timedelta(days=30))
    assert (d.bills.returning == expect).all()
    print("ok")


if __name__ == "__main__":
    main()
