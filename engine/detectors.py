"""Detectors: find issues on the three levers. Code computes every number; text is templated.

Each issue carries: lever, cause, one action (who/what/when), ₹ at stake per 4 weeks with its formula,
evidence, a `track` spec so the follow-up can re-measure it a week later, and card text for the
salespeople it names.
"""
from dataclasses import dataclass
from math import sqrt

import pandas as pd

from engine.load import Data, slug
from engine.metrics import PAIRS, PRODUCT_CATEGORIES, attendance, bill_metrics, conversion, customer_firsts, window
from engine.text import day, inr, names, pct, weekend

DAY = pd.Timedelta(days=1)
PER4W = 28  # every ₹ figure is "per 4 weeks"


@dataclass
class Ctx:
    d: Data
    E: pd.Timestamp
    cur: tuple   # last 4 weeks
    base: tuple  # 8 weeks before that
    yoy: tuple   # same 4 weeks last year (364 days back keeps weekdays aligned)
    excluded: set
    stores: pd.DataFrame
    ams: pd.DataFrame
    names: dict
    sp_store: dict
    active: set  # salespeople Present at least once in the last 14 days
    camera_suspect: set  # door camera failed in the last 4 weeks: no conversion alerts (data issue instead)


def make_ctx(d: Data) -> Ctx:
    E = d.as_of
    cur = (E - 27 * DAY, E)
    r = d.roster
    sp = d.salespeople.set_index("salesperson_id")
    sd = window(d.store_day, "date", *cur)
    return Ctx(
        d=d, E=E, cur=cur, base=(E - 83 * DAY, E - 28 * DAY), yoy=(cur[0] - 364 * DAY, cur[1] - 364 * DAY),
        camera_suspect=set(sd[~sd.valid & (sd.bills > 0)].store_id),
        excluded=set(d.stores[d.stores.opened_on > E - 90 * DAY].store_id),
        stores=d.stores.set_index("store_id"), ams=d.area_managers.set_index("area_manager_id"),
        names=sp.name.to_dict(), sp_store=sp.store_id.to_dict(),
        active=set(r[(r.status == "Present") & (r.date > E - 14 * DAY)].salesperson_id),
    )


def issue(ctx, kind, lever, scope_id, title, cause, who, what, when, rupees, formula, evidence, track,
          store_id=None, city=None, cards=None):
    city = city or ctx.stores.loc[store_id, "city"]
    am = ctx.stores[ctx.stores.city == city].area_manager_id.iat[0]
    return {
        "key": f"{kind}:{scope_id}", "kind": kind, "lever": lever, "store_id": store_id, "city": city,
        "am_id": am, "title": title, "cause": cause, "action": {"who": who, "what": what, "when": when},
        "rupees": int(round(max(rupees, 0))), "rupees_formula": formula, "evidence": evidence,
        "track": track, "cards": cards or {},
    }


def _present_days(att: pd.DataFrame) -> pd.Series:
    return att.rostered_days - att.off_days


def best_seller_now(ctx, store, exclude=()):
    """Active salesperson with highest revenue per present day in the last 4 weeks."""
    w = window(ctx.d.bills, "bill_date", *ctx.cur)
    rev = w[w.store_id == store].groupby("salesperson_id").revenue.sum()
    att = attendance(ctx.d, *ctx.cur)
    rpd = (rev / _present_days(att).reindex(rev.index)).dropna()
    rpd = rpd[[s in ctx.active and s not in exclude for s in rpd.index]]
    return rpd.idxmax() if len(rpd) else None


# ---------------------------------------------------------------- More bills

def leavers(ctx) -> dict:
    """Top sellers who stopped billing 2-11 weeks ago and are off the roster. No exit date exists, so infer."""
    d, E = ctx.d, ctx.E
    last = d.bills.groupby("salesperson_id").bill_date.max()
    out = {}
    for sp, lb in last.items():
        store = ctx.sp_store[sp]
        if not (E - 75 * DAY <= lb <= E - 14 * DAY) or sp in ctx.active or store in ctx.excluded:
            continue
        prior = window(d.bills, "bill_date", lb - 89 * DAY, lb)
        rev = prior[prior.store_id == store].groupby("salesperson_id").revenue.sum()
        share, rank = rev[sp] / rev.sum(), int(rev.rank(ascending=False)[sp])
        if rank == 1 or share >= 0.12:
            out.setdefault(store, []).append(
                {"sp": sp, "name": ctx.names[sp], "last": lb, "share": share, "rank": rank})
    return out


def staffing(ctx) -> list:
    """Too few people on the floor on busy days (weekends + wedding dates), naming who keeps missing them."""
    d, E = ctx.d, ctx.E
    pres = d.roster[d.roster.status == "Present"].groupby(["store_id", "date"]).size().rename("present").reset_index()
    x = d.store_day.merge(pres, on=["store_id", "date"], how="left")
    x = x[x.valid & (x.weekend | (x.is_wedding_date == 1))]
    # Staffing norm = up to 20 weeks before the current window (roster starts 1 May), so a problem that
    # started 5 weeks ago doesn't become its own baseline.
    base = (E - 167 * DAY, E - 28 * DAY)
    att_c, att_b = attendance(d, *ctx.cur), attendance(d, *base)
    sat, sun = weekend(E)
    out = []
    for store, g in x.groupby("store_id"):
        c, b = window(g, "date", *ctx.cur), window(g, "date", *base)
        if store in ctx.excluded | ctx.camera_suspect or len(c) < 4 or b.present.notna().sum() < 8:
            continue
        conv_c, conv_b = c.bills.sum() / c.footfall.sum(), b.bills.sum() / b.footfall.sum()
        p_c, p_b = c.present.mean(), b.present.mean()
        if not (p_c <= p_b - 0.75 and conv_c <= 0.85 * conv_b):
            continue
        missing = []
        for sp in att_c.index:
            if ctx.sp_store.get(sp) != store:
                continue
            r, rb = att_c.loc[sp], att_b.busy_off_rate.get(sp)
            if r.busy_days >= 4 and r.busy_off_rate >= 0.3 and (pd.isna(rb) or r.busy_off_rate >= 2 * rb):
                missing.append((sp, int(r.busy_off_days), int(r.busy_days)))
        who_missing = [ctx.names[s] for s, _, _ in missing]
        abv = c.revenue.sum() / c.bills.sum()
        n_floor = int(round(p_b))
        cause = (f"Busy-day headcount fell from {p_b:.1f} to {p_c:.1f} and busy-day conversion from "
                 f"{pct(conv_b, 1)} to {pct(conv_c, 1)} (last 4 weeks vs the store's norm since May).")
        if missing:
            cause += " " + "; ".join(f"{ctx.names[s]} was off {o} of {n} busy days" for s, o, n in missing) + "."
        what = f"Keep {n_floor} people on the floor both days"
        what += (f"; {names(who_missing)} work both days and take their weekly off on Tue or Wed"
                 if missing else "; move weekly offs to Tue or Wed")
        peer = best_seller_now(ctx, store, exclude=[s for s, _, _ in missing])
        cards = {s: {"behaviour": "Be on the floor on busy days",
                     "text": f"This weekend: work {sat} and {sun}, and take your weekly off on a weekday. "
                             f"You were off {o} of the last {n} busy days and the floor was short. "
                             f"{ctx.names.get(peer, 'Your best colleague')} works weekends; ask how they plan the week.",
                     "peer": peer}
                 for s, o, n in missing}
        out.append(issue(
            ctx, "staffing", "More bills", store, f"{store}: short-staffed on weekends and wedding days", cause,
            f"{store} store manager", what, f"{sat} and {sun}",
            (conv_b - conv_c) * c.footfall.sum() * abv,
            "(busy-day conversion before − now) × busy-day walk-ins (4 wks) × avg bill value",
            {"busy_conv_now": conv_c, "busy_conv_before": conv_b, "busy_headcount_now": p_c,
             "busy_headcount_before": p_b, "missing": [s for s, _, _ in missing]},
            {"metric": "busy_conversion", "scope": "store_id", "ids": [store], "at_alert": conv_c,
             "target": conv_b, "better": "up"},
            store_id=store, cards=cards))
    return out


def city_slowdown(ctx) -> list:
    """Whole city converting worse than the same weeks last year: a market problem, not one store's."""
    d, E = ctx.d, ctx.E
    W = 91  # 13 weeks smooths festival dates that move year to year (Diwali 2025: Oct, 2026: Nov)
    cur, yoy = (E - (W - 1) * DAY, E), (E - (W - 1) * DAY - 364 * DAY, E - 364 * DAY)
    c, y = conversion(d, *cur), conversion(d, *yoy)
    c = c[~c.index.isin(ctx.excluded | ctx.camera_suspect)]
    y = y.reindex(c.index)
    st = ctx.stores
    bills = window(d.bills, "bill_date", *cur)
    rate = lambda df: df.conv_bills.sum() / df.footfall.sum()
    out = []
    for city, idx in c.groupby(st.city.reindex(c.index)).groups.items():
        cc, yy = c.loc[idx], y.loc[idx]
        if len(idx) < 2 or yy.conversion.isna().any():
            continue
        now, before = rate(cc), rate(yy)
        rest = rate(c.drop(idx)) / rate(y.drop(idx).dropna()) - 1  # what the rest of the network did
        change = now / before - 1
        per_store = cc.conversion / yy.conversion - 1
        # A city is a market problem only if it fell clearly AND more than everyone else (calendar shifts hit all).
        if change > -0.08 or change - rest > -0.04 or (per_store <= -0.05).mean() < 2 / 3:
            continue
        b = bills[bills.store_id.isin(idx)]
        abv = b.revenue.sum() / len(b)
        am = ctx.ams.loc[st.loc[idx[0], "area_manager_id"]]
        out.append(issue(
            ctx, "city_slowdown", "More bills", city, f"{city}: conversion down across the city",
            f"Market problem, not one store: city conversion {pct(now, 1)} vs {pct(before, 1)} in the same 13 weeks "
            f"last year ({pct(change)}, rest of the network {pct(rest)}); "
            f"{int((per_store <= -0.05).sum())} of {len(idx)} stores are down.",
            am["name"],
            f"At today's morning call, tell {'both' if len(idx) == 2 else 'all ' + str(len(idx))} {city} store "
            f"managers the drop is city-wide, not their store; keep full Saturday and Sunday rosters and compare "
            f"stores with each other, not with last year",
            "today's morning call",
            (before - now) * cc.footfall.sum() * abv * PER4W / W,
            "(city conversion last year − now) × walk-ins (13 wks) × avg bill value, per 4 weeks",
            {"conv_now": now, "conv_last_year": before, "network_change": rest,
             "per_store_change": per_store.round(3).to_dict()},
            {"metric": "conversion", "scope": "store_id", "ids": list(idx), "at_alert": now, "target": before,
             "better": "up", "window_days": W},
            city=city))
    return out


def conversion_drop(ctx, skip: set, slow_cities: set) -> list:
    """Walk-ins steady but fewer buying. Cause: a top seller left, or (if no specific cause) floor engagement."""
    d, E = ctx.d, ctx.E
    cur, base, yoy = conversion(d, *ctx.cur), conversion(d, *ctx.base), conversion(d, *ctx.yoy)
    lv = leavers(ctx)
    sat, sun = weekend(E)
    out = []
    for store in cur.index:
        if store in ctx.excluded | ctx.camera_suspect or store in skip:
            continue
        if store in lv:
            L = max(lv[store], key=lambda x: x["share"])
            after, before = (L["last"] + DAY, E), (L["last"] - 55 * DAY, L["last"])
            ca = conversion(d, *after).conversion.get(store)
            cb = conversion(d, *before).conversion.get(store)
            cy = conversion(d, after[0] - 364 * DAY, after[1] - 364 * DAY).conversion.get(store)
            if (E - L["last"]).days >= 7 and None not in (ca, cb, cy) and ca <= 0.9 * min(cb, cy):
                ref = min(cb, cy)
                a = conversion(d, *after).loc[store]
                ab = window(d.bills, "bill_date", *after)
                abv = ab[ab.store_id == store].revenue.mean()
                peer = best_seller_now(ctx, store)
                yr = window(d.bills, "bill_date", E - 364 * DAY, E)
                n_cust = yr[(yr.salesperson_id == L["sp"]) & yr.known_customer].customer_id.nunique()
                pn = ctx.names.get(peer, "the top seller")
                out.append(issue(
                    ctx, "leaver", "More bills", store, f"{store}: top seller {L['name']} has left",
                    f"{L['name']} ({'#1' if L['rank'] == 1 else '#' + str(L['rank'])} seller, "
                    f"{pct(L['share'])} of store sales) last billed on {day(L['last'])}. Conversion since: "
                    f"{pct(ca, 1)}, vs {pct(cb, 1)} before and {pct(cy, 1)} in the same weeks last year.",
                    f"{store} store manager and {pn}",
                    f"Hand {L['name']}'s {n_cust} customers from the last 12 months to {pn}; {pn} calls 10 of "
                    f"them today, and is on the floor 5–9 pm on {sat} and {sun}",
                    f"today; {sat} and {sun}",
                    (ref - ca) * a.footfall * abv * PER4W / a.valid_days,
                    "(conversion before exit − since exit) × walk-ins since exit × avg bill value, per 4 weeks",
                    {"left": L["sp"], "last_bill": L["last"].date().isoformat(), "conv_since": ca,
                     "conv_before": cb, "conv_last_year": cy, "customers_12m": int(n_cust)},
                    {"metric": "conversion", "scope": "store_id", "ids": [store], "at_alert": ca, "target": ref,
                     "better": "up"},
                    store_id=store,
                    cards={peer: {"behaviour": f"Look after {L['name']}'s customers",
                                  "text": f"Today: call 10 of {L['name']}'s past customers and invite them in; "
                                          f"they are yours now. Be on the floor 5–9 pm on {sat} and {sun}.",
                                  "peer": None}} if peer else {}))
                continue
        if ctx.stores.loc[store, "city"] in slow_cities:
            continue  # market issue already raised for the city
        c, b, y = cur.conversion[store], base.conversion.get(store), yoy.conversion.get(store)
        if b is None or y is None or pd.isna(b) or pd.isna(y):
            continue
        ref = min(b, y)
        # Small stores swing by chance: require a real drop AND ~2.5 standard errors (walk-ins as trials).
        if c > 0.88 * ref or (ref - c) / sqrt(ref * (1 - ref) / cur.footfall[store]) < 2.5:
            continue
        ff_c = cur.footfall[store] / cur.valid_days[store]
        ff_b = base.footfall[store] / base.valid_days[store]
        w = window(d.bills, "bill_date", *ctx.cur)
        abv = w[w.store_id == store].revenue.mean()
        out.append(issue(
            ctx, "conversion_drop", "More bills", store, f"{store}: fewer walk-ins are buying",
            f"Walk-ins {ff_c:.0f}/day vs {ff_b:.0f}/day before, but conversion fell to {pct(c, 1)} from {pct(b, 1)} "
            f"(8 weeks before) and {pct(y, 1)} (same weeks last year).",
            f"{store} store manager",
            "Greet every walk-in within a minute and start a trial; the manager stays on the floor 5–9 pm",
            "today and every day this week",
            (ref - c) * cur.footfall[store] * abv,
            "(lower of prior-8-week and last-year conversion − now) × walk-ins (4 wks) × avg bill value",
            {"conv_now": c, "conv_before": b, "conv_last_year": y, "walkins_per_day_now": ff_c,
             "walkins_per_day_before": ff_b},
            {"metric": "conversion", "scope": "store_id", "ids": [store], "at_alert": c, "target": ref,
             "better": "up"},
            store_id=store))
    return out


# ---------------------------------------------------------------- Bigger baskets

def _avg_price(lines, by):
    p = lines[lines.is_packaging == 0]
    return p.groupby(by).selling_price.mean()


def season_factor(ctx, bills_12m: pd.DataFrame, col: str) -> pd.Series:
    """Per store: bills with `col` in the coming 4 weeks LAST year ÷ an average 4 weeks. Wedding season > 1.

    Basket ₹ is forward-looking: a sherwani gap matters more going into November than its yearly average says.
    """
    E = ctx.E
    nxt = window(ctx.d.bills, "bill_date", E + DAY - 364 * DAY, E + 28 * DAY - 364 * DAY)
    ahead = nxt[nxt[col]].groupby("store_id").size()
    avg = bills_12m[bills_12m[col]].groupby("store_id").size() * PER4W / 365
    return (ahead / avg).fillna(1).clip(0.25, 4)


def attach_gap(ctx) -> list:
    """Salesperson not adding the obvious pair. 12-month window: sherwani is seasonal and volumes are small."""
    d, E = ctx.d, ctx.E
    start = E - 364 * DAY
    w = window(d.bills, "bill_date", start, E)
    w = w[~w.store_id.isin(ctx.excluded)]
    price = _avg_price(window(d.lines, "bill_date", start, E), ["store_id", "category"])
    out = []
    for anchor, adds in PAIRS.items():
        a = w[w[f"has_{slug(anchor)}"]]
        season = season_factor(ctx, w, f"has_{slug(anchor)}")
        min_n = 15 if anchor == "Sherwani" else 40
        for store, g in a.groupby("store_id"):
            counts = g.salesperson_id.value_counts()
            eligible = [s for s, n in counts.items() if n >= min_n and s in ctx.active]
            for sp in eligible:
                mine, rest = g[g.salesperson_id == sp], g[g.salesperson_id != sp]
                gaps = []
                for add in adds:
                    col = f"has_{slug(add)}"
                    r, pr = mine[col].mean(), rest[col].mean()
                    if r <= 0.5 * pr and pr - r >= 0.12:
                        gaps.append({"add": add, "col": col, "rate": r, "peer_rate": pr,
                                     "rupees": (pr - r) * len(mine) * PER4W / 365 * season.get(store, 1)
                                               * price.get((store, add), 0)})
                if not gaps:
                    continue
                top = max(gaps, key=lambda x: x["rupees"])
                rates = {s: g[g.salesperson_id == s][top["col"]].mean() for s in eligible if s != sp}
                peer = max(rates, key=rates.get) if rates else None
                pn = ctx.names.get(peer, "your best colleague")
                adds_txt = names([x["add"].lower() for x in gaps])
                nm = ctx.names[sp]
                out.append(issue(
                    ctx, "attach_gap", "Bigger baskets", f"{sp}:{slug(anchor)}",
                    f"{nm} ({store}) rarely adds a {adds_txt} to a {anchor.lower()}",
                    "; ".join(f"adds a {x['add'].lower()} to {pct(x['rate'])} of {anchor.lower()} bills vs "
                              f"{pct(x['peer_rate'])} for the rest of {store}" for x in gaps)
                    + f" ({len(mine)} {anchor.lower()} bills, last 12 months).",
                    nm, f"Show a {adds_txt} with every {anchor.lower()} trial", "today, at every trial",
                    sum(x["rupees"] for x in gaps),
                    f"Σ (store attach − own attach) × own {anchor.lower()} bills per 4 weeks × season factor "
                    f"(same 4 weeks last year) × add-on avg price",
                    {"anchor_bills_12m": int(len(mine)), "season_factor": float(season.get(store, 1)), "gaps": [{k: v for k, v in x.items() if k != "col"} for x in gaps],
                     "peer": peer, "peer_rate": rates.get(peer)},
                    {"metric": "attach", "scope": "salesperson_id", "ids": [sp], "anchor": f"has_{slug(anchor)}",
                     "col": top["col"], "at_alert": top["rate"], "target": top["peer_rate"], "better": "up",
                     "window_days": 365},
                    store_id=store,
                    cards={sp: {"behaviour": f"Add a {adds_txt} to every {anchor.lower()}",
                                "text": f"Today: show a {adds_txt} with every {anchor.lower()} trial. You add a "
                                        f"{top['add'].lower()} on {pct(top['rate'])} of {anchor.lower()} bills; "
                                        f"{pn} does it on {pct(rates.get(peer, top['peer_rate']))}. "
                                        f"Watch {pn} at the next trial.",
                                "peer": peer}}))
    return out


def category_avoid(ctx) -> list:
    """Salesperson avoiding a category their city buys. Compared with their city, so regional taste isn't a problem."""
    d, E = ctx.d, ctx.E
    start = E - 364 * DAY
    w = window(d.bills, "bill_date", start, E)
    w = w[~w.store_id.isin(ctx.excluded)]
    m = bill_metrics(w, "salesperson_id")
    m = m[m.bills >= 100].join(pd.Series(ctx.sp_store, name="store_id"))
    m["city"] = ctx.stores.city.reindex(m.store_id).values
    lines = window(d.lines, "bill_date", start, E)
    lines = lines.assign(city=ctx.stores.city.reindex(lines.store_id).values)
    per_bill = lines.groupby(["city", "category"]).revenue.sum() / lines.groupby(["city", "category"]).bill_id.nunique()
    out = []
    for cat in PRODUCT_CATEGORIES:
        col = f"mix_{slug(cat)}"
        season = season_factor(ctx, w, f"has_{slug(cat)}")
        for city, g in m.groupby("city"):
            for sp in g.index:
                others = g.drop(sp)[col].median()
                mine = g.at[sp, col]
                if sp not in ctx.active or not others >= 0.05 or mine >= 0.4 * others:
                    continue
                store = g.at[sp, "store_id"]
                same = m[(m.store_id == store) & m.index.isin(ctx.active) & (m.index != sp)]
                peer = same[col].idxmax() if len(same) else None
                pn = ctx.names.get(peer, "your best colleague")
                nm = ctx.names[sp]
                out.append(issue(
                    ctx, "category_avoid", "Bigger baskets", f"{sp}:{slug(cat)}",
                    f"{nm} ({store}) rarely sells {cat}",
                    f"{cat} is on {pct(mine, 1)} of {nm}'s bills vs {pct(others, 1)} for other {city} salespeople "
                    f"({int(g.at[sp, 'bills'])} bills, last 12 months). {city} buys it; this is one person's gap.",
                    nm, f"Show two {cat} looks to every wedding customer; ask {pn} for their best look first",
                    "today",
                    (others - mine) * g.at[sp, "bills"] * PER4W / 365 * season.get(store, 1)
                    * per_bill.get((city, cat), 0),
                    f"(city {cat} share − own) × own bills per 4 weeks × season factor × avg {cat} value per bill",
                    {"mix": mine, "city_median": others, "bills_12m": int(g.at[sp, "bills"]),
                     "season_factor": float(season.get(store, 1)), "peer": peer},
                    {"metric": "mix", "scope": "salesperson_id", "ids": [sp], "col": f"has_{slug(cat)}",
                     "at_alert": mine, "target": others, "better": "up", "window_days": 365},
                    store_id=store,
                    cards={sp: {"behaviour": f"Show {cat} to wedding customers",
                                "text": f"Today: show two {cat} looks to every wedding customer. {cat} is on "
                                        f"{pct(mine, 1)} of your bills and {pct(others, 1)} across {city}. "
                                        f"{pn} sells it most here; ask for their best look.",
                                "peer": peer}}))
    return out


def discount_outlier(ctx) -> list:
    """Discounts well above the store's norm. One issue per store, naming everyone involved."""
    d, E = ctx.d, ctx.E
    w = window(d.bills, "bill_date", E - 89 * DAY, E)
    w = w[~w.store_id.isin(ctx.excluded)]
    out = []
    for store, g in w.groupby("store_id"):
        m = bill_metrics(g, "salesperson_id")
        m = m[m.bills >= 30]
        flagged = []
        for sp in m.index:
            rest = g[g.salesperson_id != sp]
            norm = rest.discount.sum() / rest.mrp_value.sum()
            rate = m.at[sp, "discount_pct"]
            if sp in ctx.active and rate >= 2.5 * norm and rate - norm >= 0.02:
                flagged.append((sp, rate, norm, (rate - norm) * m.at[sp, "mrp_value"] * PER4W / 90))
        if not flagged:
            continue
        ok = m[(m.discount_pct <= m.discount_pct.median()) & m.index.isin(ctx.active)]
        peer = ok.bills.idxmax() if len(ok) else None
        pn = ctx.names.get(peer, "the rest of the team")
        ids = [s for s, *_ in flagged]
        who = names([ctx.names[s] for s in ids])
        rest_all = g[~g.salesperson_id.isin(ids)]
        norm_all = rest_all.discount.sum() / rest_all.mrp_value.sum()
        mine = g[g.salesperson_id.isin(ids)]
        out.append(issue(
            ctx, "discount_outlier", "Bigger baskets", store, f"{store}: discounts well above the store norm",
            "; ".join(f"{ctx.names[s]} gives {pct(r, 1)} off MRP vs {pct(n, 1)} for the rest of the store"
                      for s, r, n, _ in flagged) + " (last 90 days).",
            f"{store} store manager with {who}",
            f"No discount without the store manager's OK; sell at MRP like {pn}", "from today's first bill",
            sum(x[3] for x in flagged), "Σ (own discount % − store norm) × own MRP value (90 days) × 28/90",
            {"people": {s: {"discount_pct": r, "norm": n} for s, r, n, _ in flagged}, "peer": peer},
            {"metric": "discount_pct", "scope": "salesperson_id", "ids": ids,
             "at_alert": mine.discount.sum() / mine.mrp_value.sum(), "target": norm_all, "better": "down",
             "window_days": 90},
            store_id=store,
            cards={s: {"behaviour": "Sell at MRP",
                       "text": f"Today: sell at MRP and ask the manager before any discount. You gave {pct(r, 1)} "
                               f"off MRP; the rest of the store gives {pct(n, 1)}. {pn} closes at MRP; "
                               f"copy their pitch.",
                       "peer": peer} for s, r, n, _ in flagged}))
    return out


# ---------------------------------------------------------------- More repeat

def _repeat_cohort(ctx):
    """Customers first billed 6–18 months ago: everyone has had 6+ months to come back."""
    f = customer_firsts(ctx.d.bills, ctx.E)
    f = window(f, "first_date", ctx.E - 545 * DAY, ctx.E - 180 * DAY)
    return f[~f.store_id.isin(ctx.excluded)]


def role_models(ctx) -> list:
    """People whose customers come back far more than their store's. Named so others can learn."""
    f = _repeat_cohort(ctx)
    out = []
    for store, g in f.groupby("store_id"):
        n = g.groupby("salesperson_id").repeat.agg(["size", "mean"])
        for sp in n.index:
            rest = g[g.salesperson_id != sp].repeat.mean()
            if sp in ctx.active and n.at[sp, "size"] >= 150 and n.at[sp, "mean"] >= 2 * rest:
                out.append({"salesperson_id": sp, "name": ctx.names[sp], "store_id": store,
                            "city": ctx.stores.loc[store, "city"], "am_id": ctx.stores.loc[store, "area_manager_id"],
                            "repeat_rate": float(n.at[sp, "mean"]), "store_rate": float(rest),
                            "customers": int(n.at[sp, "size"])})
    return sorted(out, key=lambda x: -x["repeat_rate"])


def repeat_low(ctx) -> list:
    d, E = ctx.d, ctx.E
    f = _repeat_cohort(ctx)
    sherwani_first = set(d.bills[d.bills.has_sherwani].bill_id)
    abv = window(d.bills, "bill_date", E - 364 * DAY, E).groupby("store_id").revenue.mean()
    out = []
    for store, g in f.groupby("store_id"):
        n = g.groupby("salesperson_id").repeat.agg(["size", "mean"])
        big = n[n["size"] >= 80]
        for sp in n.index:
            if sp not in ctx.active or n.at[sp, "size"] < 150:
                continue
            r, pr = n.at[sp, "mean"], g[g.salesperson_id != sp].repeat.mean()
            z = (pr - r) / sqrt(pr * (1 - pr) / n.at[sp, "size"])
            if not (r <= 0.5 * pr and z >= 2.5):
                continue
            others = big.drop(sp, errors="ignore")
            others = others[others.index.isin(ctx.active)]
            peer = others["mean"].idxmax() if len(others) else None
            pn = ctx.names.get(peer, "your best colleague")
            mine = g[g.salesperson_id == sp]
            lapsed = int((~mine.repeat & mine.bill_id.isin(sherwani_first)).sum())
            k = min(15, lapsed) or 10
            nm = ctx.names[sp]
            out.append(issue(
                ctx, "repeat_low", "More repeat", sp, f"{nm} ({store}): customers don't come back",
                f"{pct(r, 1)} of {nm}'s customers came back 30+ days later vs {pct(pr, 1)} for the rest of {store} "
                f"({int(n.at[sp, 'size'])} customers first billed 6–18 months ago). {pn} is the role model "
                f"at {pct(others['mean'].get(peer, pr), 1)}.",
                nm,
                f"Call {k} of the {lapsed} wedding customers you served 6–18 months ago who haven't been back and "
                f"invite them in; ask {pn} for their follow-up words first",
                "today, before 12 noon",
                (pr - r) * n.at[sp, "size"] * abv.get(store, 0) * PER4W / 365,
                "(store repeat rate − own) × own new customers (12-month cohort) × avg bill value, per 4 weeks",
                {"repeat_rate": r, "store_rate": pr, "z": z, "customers": int(n.at[sp, "size"]),
                 "lapsed_wedding_customers": lapsed, "peer": peer},
                {"metric": "returning_share", "scope": "salesperson_id", "ids": [sp],
                 "at_alert": None, "target": None, "better": "up"},
                store_id=store,
                cards={sp: {"behaviour": "Bring past customers back",
                            "text": f"Today: call {k} past wedding customers who haven't been back and invite them in. "
                                    f"{pct(r, 1)} of your customers return; {pct(others['mean'].get(peer, pr), 1)} of "
                                    f"{pn}'s do. Ask {pn} what they say on the call.",
                            "peer": peer}}))
    return out


def detect(ctx) -> list:
    lv = leavers(ctx)
    # A headcount drop with nobody missing shifts is explained by the leaver; report that cause instead.
    st = [i for i in staffing(ctx) if i["evidence"]["missing"] or i["store_id"] not in lv]
    cities = city_slowdown(ctx)
    issues = st + cities + conversion_drop(ctx, skip={i["store_id"] for i in st}, slow_cities={i["city"] for i in cities})
    issues += attach_gap(ctx) + category_avoid(ctx) + discount_outlier(ctx) + repeat_low(ctx)
    return sorted(issues, key=lambda i: -i["rupees"])
