"""Lever metrics for any window and grouping. Detectors compare these across windows and peers."""
import pandas as pd

from engine.load import Data, slug

# Anchor category -> the obvious add-ons from the brief.
PAIRS = {"Sherwani": ["Safa", "Mojari", "Mala"], "Kurta Set": ["Jacket"]}
PRODUCT_CATEGORIES = ["Sherwani", "Indo-Western", "Kurta Set", "Jacket", "Mojari", "Safa", "Mala", "Stole"]
REPEAT_GAP = pd.Timedelta(days=30)


def window(df: pd.DataFrame, col: str, start, end) -> pd.DataFrame:
    return df[(df[col] >= pd.Timestamp(start)) & (df[col] <= pd.Timestamp(end))]


def bill_metrics(bills: pd.DataFrame, by) -> pd.DataFrame:
    """Basket + discount + mix metrics over whatever bills you pass in."""
    g = bills.groupby(by)
    out = g.agg(
        bills=("bill_id", "size"), revenue=("revenue", "sum"), items=("items", "sum"),
        discount=("discount", "sum"), mrp_value=("mrp_value", "sum"),
        known_bills=("known_customer", "sum"), returning_bills=("returning", "sum"),
    )
    out["customers"] = bills[bills.known_customer].groupby(by).customer_id.nunique()
    out["items_per_bill"] = out["items"] / out["bills"]
    out["abv"] = out.revenue / out.bills
    out["discount_pct"] = out.discount / out.mrp_value
    out["placeholder_share"] = 1 - out.known_bills / out.bills
    # Share of identifiable bills from repeat customers; moves week to week, so follow-ups can use it.
    out["returning_share"] = out.returning_bills / out.known_bills.where(out.known_bills > 0)
    for c in PRODUCT_CATEGORIES:
        col = f"has_{slug(c)}"
        if col in bills:
            out[f"mix_{slug(c)}"] = g[col].mean()  # share of bills carrying the category
    for anchor, adds in PAIRS.items():
        a = bills[bills[f"has_{slug(anchor)}"]].groupby(by)
        out[f"{slug(anchor)}_bills"] = a.size()
        for add in adds:
            out[f"attach_{slug(anchor)}_{slug(add)}"] = a[f"has_{slug(add)}"].mean()
    out[[c for c in out if c.endswith("_bills")]] = out[[c for c in out if c.endswith("_bills")]].fillna(0)
    return out


def conversion(d: Data, start, end, by="store_id") -> pd.DataFrame:
    """Bills / footfall over valid store-days only (broken camera days excluded)."""
    sd = window(d.store_day, "date", start, end)
    v = sd[sd.valid].groupby(by).agg(
        footfall=("footfall", "sum"), conv_bills=("bills", "sum"), valid_days=("date", "size"))
    v["conversion"] = v.conv_bills / v.footfall
    v["invalid_days"] = sd[~sd.valid & (sd.bills > 0)].groupby(by).size().reindex(v.index).fillna(0).astype(int)
    return v


def store_metrics(d: Data, start, end) -> pd.DataFrame:
    return bill_metrics(window(d.bills, "bill_date", start, end), "store_id").join(conversion(d, start, end))


def customer_firsts(bills: pd.DataFrame, as_of) -> pd.DataFrame:
    """One row per customer: first bill's date/store/salesperson, eligibility and repeat flag.

    Repeat = billed again 30+ days after first bill (any store). Credited to the first bill's
    store and salesperson. Eligible only if first bill is 30+ days before as_of (right-censoring).
    ponytail: customers who first bought before Nov 2024 look new; no earlier data to fix that.
    """
    b = bills.sort_values(["bill_date", "bill_id"])
    if "known_customer" in b:
        b = b[b.known_customer]
    first = b.groupby("customer_id").first()[["bill_id", "bill_date", "store_id", "salesperson_id"]]
    last = b.groupby("customer_id").bill_date.max()
    first["repeat"] = last >= first.bill_date + REPEAT_GAP
    first["eligible"] = first.bill_date <= pd.Timestamp(as_of) - REPEAT_GAP
    return first.rename(columns={"bill_date": "first_date"})


def repeat_metrics(d: Data, cohort_start, cohort_end, by="store_id") -> pd.DataFrame:
    """Repeat rate for customers whose FIRST bill fell in the cohort window. Compare peers on the same cohort."""
    f = customer_firsts(d.bills, d.as_of)
    f = window(f, "first_date", cohort_start, cohort_end)
    f = f[f.eligible]
    out = f.groupby(by).agg(new_customers=("repeat", "size"), repeaters=("repeat", "sum"))
    out["repeat_rate"] = out.repeaters / out.new_customers
    return out


def attendance(d: Data, start, end) -> pd.DataFrame:
    """Per salesperson roster days; off-days on busy days (weekend or wedding date) separated out."""
    r = window(d.roster, "date", start, end).merge(
        d.store_day[["store_id", "date", "weekend", "is_wedding_date"]], on=["store_id", "date"], how="left")
    r["off"] = r.status == "Off"
    r["busy"] = r.weekend.fillna(False) | (r.is_wedding_date.fillna(0) == 1)
    g = r.groupby("salesperson_id")
    out = g.agg(rostered_days=("date", "size"), off_days=("off", "sum"), last_rostered=("date", "max"))
    out["busy_days"] = r[r.busy].groupby("salesperson_id").size()
    out["busy_off_days"] = r[r.busy & r.off].groupby("salesperson_id").size()
    out[["busy_days", "busy_off_days"]] = out[["busy_days", "busy_off_days"]].fillna(0).astype(int)
    out["busy_off_rate"] = out.busy_off_days / out.busy_days.where(out.busy_days > 0)
    return out


def salesperson_metrics(d: Data, start, end) -> pd.DataFrame:
    sp = bill_metrics(window(d.bills, "bill_date", start, end), "salesperson_id")
    last_bill = d.bills.groupby("salesperson_id").bill_date.max().rename("last_bill")
    base = d.salespeople.set_index("salesperson_id")[["store_id", "name", "join_date"]]
    return base.join(sp).join(attendance(d, start, end)).join(last_bill)


def data_issues(d: Data) -> list[dict]:
    """Numbers that can't be right. These never reach an area manager."""
    out = []
    sd = d.store_day
    checks = {
        "footfall_zero_with_bills": (sd.bills > 0) & ~(sd.footfall > 0),
        "bills_exceed_footfall": (sd.footfall > 0) & (sd.bills > sd.footfall),
    }
    for kind, mask in checks.items():
        for store, g in sd[mask].groupby("store_id"):
            out.append({"type": kind, "store_id": store, "from": g.date.min().date().isoformat(),
                        "to": g.date.max().date().isoformat(), "days": int(len(g)),
                        "bills_affected": int(g.bills.sum()),
                        "note": "Door-camera count unusable; conversion excluded for these days."})
    for _, s in d.stores[d.stores.opened_on > d.as_of - pd.Timedelta(days=90)].iterrows():
        out.append({"type": "new_store_no_baseline", "store_id": s.store_id,
                    "from": s.opened_on.date().isoformat(), "note": "Opened <90 days ago; kept out of peer comparisons."})
    # Dummy mobile number at the till: flag stores where its share jumped vs their own history.
    b = d.bills
    recent = b.bill_date > d.as_of - pd.Timedelta(days=90)
    now = 1 - b[recent].groupby("store_id").known_customer.mean()
    before = (1 - b[~recent].groupby("store_id").known_customer.mean()).reindex(now.index).fillna(0)
    for store in now[(now > 0.10) & (now > 3 * before)].index:
        ph = b[recent & (b.store_id == store) & ~b.known_customer]
        out.append({"type": "placeholder_customer_id", "store_id": store,
                    "customer_id": ph.customer_id.mode().iat[0], "from": ph.bill_date.min().date().isoformat(),
                    "share_last_90d": round(float(now[store]), 3), "share_before": round(float(before[store]), 3),
                    "bills_affected": int(len(ph)),
                    "top_salespeople": ph.salesperson_id.value_counts().head(3).to_dict(),
                    "note": "Dummy mobile number on bills; repeat rate for this store can't be measured. Excluded from repeat."})
    billed = set(d.bills.salesperson_id)
    for _, p in d.salespeople[~d.salespeople.salesperson_id.isin(billed)].iterrows():
        out.append({"type": "salesperson_no_bills", "store_id": p.store_id, "salesperson_id": p.salesperson_id,
                    "note": "On staff list but never billed."})
    missing = d.items[d.items.launch_date.isna() & (d.items.is_packaging == 0)]
    if len(missing):
        out.append({"type": "item_missing_launch_date", "skus": missing.sku_id.tolist()})
    return out
