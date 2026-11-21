"""Load the Manyavar CSVs into typed DataFrames, cut at an as-of date."""
from dataclasses import dataclass

import pandas as pd

from engine import source
from engine.source import DATA_DIR  # noqa: F401  (tests read the raw CSVs)

PLACEHOLDER_MIN_BILLS = 50

NUMERIC = {
    "bill_lines": ["qty", "mrp", "selling_price"],
    "items": ["mrp", "cost_price", "is_core_style", "is_packaging"],
    "footfall_daily": ["footfall"],
    "stores": ["size_sqft", "stock_capacity_units"],
    "calendar": ["is_wedding_date"],
    "area_managers": ["max_alerts_per_week"],
}
DATES = {
    "bills": ["bill_date"],
    "footfall_daily": ["date"],
    "roster_daily": ["date"],
    "calendar": ["date"],
    "salespeople": ["join_date"],
    "stores": ["opened_on"],
    "items": ["launch_date"],
}


def slug(s: str) -> str:
    return s.lower().replace(" ", "_").replace("-", "_")


def read(name: str) -> pd.DataFrame:
    # IDs stay text; blanks stay "" until a column is converted.
    df = source.table(name)
    for c in NUMERIC.get(name, []):
        df[c] = pd.to_numeric(df[c])
    for c in DATES.get(name, []):
        df[c] = pd.to_datetime(df[c], format="%Y-%m-%d", errors="coerce")  # blank -> NaT
    return df


@dataclass
class Data:
    as_of: pd.Timestamp
    stores: pd.DataFrame
    area_managers: pd.DataFrame
    salespeople: pd.DataFrame
    items: pd.DataFrame
    calendar: pd.DataFrame
    roster: pd.DataFrame
    footfall: pd.DataFrame
    lines: pd.DataFrame      # bill lines + bill header + item attrs
    bills: pd.DataFrame      # one row per bill, product-only totals + has_<category> flags
    store_day: pd.DataFrame  # store x date: footfall, bills, revenue, calendar, valid flag


def load(as_of=None) -> Data:
    as_of = pd.Timestamp(as_of) if as_of else source.data_end()
    stores, items, cal = read("stores"), read("items"), read("calendar")

    bills = read("bills")
    bills = bills[bills.bill_date <= as_of]
    lines = (
        read("bill_lines")
        .merge(bills, on="bill_id", validate="many_to_one")  # inner join drops lines after as_of
        .merge(items[["sku_id", "style_id", "category", "is_packaging"]], on="sku_id", validate="many_to_one")
    )
    lines["revenue"] = lines.qty * lines.selling_price
    lines["mrp_value"] = lines.qty * lines.mrp
    lines["discount"] = lines.mrp_value - lines.revenue

    prod = lines[lines.is_packaging == 0]
    totals = prod.groupby("bill_id").agg(
        revenue=("revenue", "sum"), items=("qty", "sum"),
        discount=("discount", "sum"), mrp_value=("mrp_value", "sum"),
    )
    flags = (pd.crosstab(prod.bill_id, prod.category) > 0).rename(columns=lambda c: f"has_{slug(c)}")
    bills = bills.set_index("bill_id").join(totals).join(flags)
    bills[totals.columns] = bills[totals.columns].fillna(0)  # packaging-only bills
    bills[flags.columns] = bills[flags.columns].fillna(False).astype(bool)
    bills = bills.reset_index()
    # A "customer" with dozens of bills is a dummy mobile number typed at the till, not a person.
    # ponytail: fixed cut-off; real max is ~7 bills, placeholder has ~1.8k, so 50 is far from both.
    counts = bills.customer_id.value_counts()
    bills["known_customer"] = ~bills.customer_id.isin(counts[counts > PLACEHOLDER_MIN_BILLS].index)
    # Returning = this bill is 30+ days after the customer's first-ever bill (brief's repeat rule).
    first = bills.groupby("customer_id").bill_date.transform("min")
    bills["returning"] = bills.known_customer & (bills.bill_date >= first + pd.Timedelta(days=30))

    footfall = read("footfall_daily")
    footfall = footfall[footfall.date <= as_of]
    roster = read("roster_daily")
    roster = roster[roster.date <= as_of]

    return Data(
        as_of=as_of, stores=stores, area_managers=read("area_managers"),
        salespeople=read("salespeople"), items=items, calendar=cal,
        roster=roster, footfall=footfall, lines=lines, bills=bills,
        store_day=_store_day(bills, footfall, stores, cal),
    )


def _store_day(bills, footfall, stores, cal) -> pd.DataFrame:
    b = (bills.groupby(["store_id", "bill_date"])
         .agg(bills=("bill_id", "size"), revenue=("revenue", "sum"))
         .reset_index().rename(columns={"bill_date": "date"}))
    sd = footfall.merge(b, on=["store_id", "date"], how="outer")
    sd[["bills", "revenue"]] = sd[["bills", "revenue"]].fillna(0)
    sd = sd.merge(stores[["store_id", "city", "state"]], on="store_id", how="left")
    sd = sd.merge(cal, on=["date", "state"], how="left")
    sd["festival"] = sd.festival.fillna("")
    sd["is_wedding_date"] = sd.is_wedding_date.fillna(0).astype(int)
    sd["weekend"] = sd.date.dt.dayofweek >= 5
    # A day counts toward conversion only if the door camera plausibly worked.
    sd["valid"] = (sd.footfall > 0) & (sd.bills <= sd.footfall)
    return sd
