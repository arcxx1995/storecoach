"""Salesperson cards: one behaviour, one same-store peer, one action today. ≤ 60 words."""
import pandas as pd

from engine.detectors import DAY, PER4W, Ctx
from engine.metrics import bill_metrics, window
from engine.text import pct, words

MAX_WORDS = 60


def _peers(ctx: Ctx, sp: str, store: str, m: pd.DataFrame):
    """Active colleagues with 20+ bills: own store first, then city, then state. Returns (peers, same_store)."""
    ok = m[(m.index != sp) & m.index.isin(ctx.active) & (m.bills >= 20)]
    st = ctx.stores
    for col, same in ((None, True), ("city", False), ("state", False)):
        theirs = ok.store_id if col is None else st[col].reindex(ok.store_id).values
        peers = ok[theirs == (store if col is None else st.at[store, col])]
        if len(peers):
            return peers, same
    return ok.iloc[0:0], False


def _gap_candidates(ctx: Ctx, sp: str, store: str, m: pd.DataFrame, item_price: float, jacket_price: float):
    """Where this person trails their own store most, in ₹ per 4 weeks. Peers = active colleagues, same store."""
    me = m.loc[sp]
    peers, same = _peers(ctx, sp, store, m)
    if peers.empty:
        return []
    nm = lambda b: ctx.names[b] if same else f"the best {ctx.stores.at[store, 'city']} salesperson"
    pid = lambda b: b if same else None  # only name a colleague from the same store
    k = PER4W / 90
    out = []
    best = peers.items_per_bill.idxmax()
    gap = peers.at[best, "items_per_bill"] - me.items_per_bill
    if gap >= 0.1:
        out.append(("items_per_bill", gap * me.bills * item_price * k, pid(best),
                    f"Today: add one more piece to every bill, like a stole, mala or mojari. You average "
                    f"{me.items_per_bill:.1f} items a bill; {nm(best)} averages "
                    f"{peers.at[best, 'items_per_bill']:.1f}. Offer the add-on before billing.",
                    "One more piece on every bill"))
    kp = peers[peers.kurta_set_bills >= 15]
    if me.kurta_set_bills >= 15 and len(kp):
        best = kp.attach_kurta_set_jacket.idxmax()
        gap = kp.at[best, "attach_kurta_set_jacket"] - me.attach_kurta_set_jacket
        if gap >= 0.05:
            out.append(("attach_kurta_set_jacket", gap * me.kurta_set_bills * jacket_price * k, pid(best),
                        f"Today: offer a matching jacket with every kurta set trial. You add one on "
                        f"{pct(me.attach_kurta_set_jacket)} of kurta bills; {nm(best)} does on "
                        f"{pct(kp.at[best, 'attach_kurta_set_jacket'])}. {"Ask which jackets pair best." if same else "Ask your manager which jackets pair best."}",
                        "Jacket with every kurta set"))
    return out


def _role_model_card(ctx, sp, store, m):
    """No gap worth coaching: they lead; ask them to teach the colleague who trails most."""
    peers = m[(m.store_id == store) & (m.index != sp) & m.index.isin(ctx.active) & (m.bills >= 20)]
    if peers.empty:
        return None
    low = peers.items_per_bill.idxmin()
    return {"behaviour": "Teach what you do well", "peer": low, "source": "role_model",
            "text": f"You average {m.at[sp, 'items_per_bill']:.1f} items a bill, among the best in {store}. "
                    f"Today: let {ctx.names[low]} shadow you on two trials and show how you add the second piece."}


def build_cards(ctx: Ctx, issues: list) -> list:
    d, E = ctx.d, ctx.E
    w = window(d.bills, "bill_date", E - 89 * DAY, E)
    m = bill_metrics(w, "salesperson_id").join(pd.Series(ctx.sp_store, name="store_id"))
    lines = window(d.lines, "bill_date", E - 89 * DAY, E)
    prod = lines[lines.is_packaging == 0]
    item_price = prod.groupby("store_id").selling_price.mean()
    jacket = prod[prod.category == "Jacket"].groupby("store_id").selling_price.mean()

    from_issue = {}
    for i in sorted(issues, key=lambda i: i["rupees"]):  # biggest ₹ wins when someone is in several issues
        for sp, c in i["cards"].items():
            from_issue[sp] = {**c, "source": i["key"], "rupees": i["rupees"]}

    cards = []
    for sp in sorted(ctx.active):
        store = ctx.sp_store[sp]
        if sp in from_issue:
            c = from_issue[sp]
        elif sp in m.index and m.at[sp, "bills"] >= 20:
            cands = _gap_candidates(ctx, sp, store, m, item_price.get(store, 0), jacket.get(store, 0))
            if cands:
                metric, rupees, peer, text, beh = max(cands, key=lambda x: x[1])
                c = {"behaviour": beh, "peer": peer, "text": text, "source": metric, "rupees": int(rupees)}
            else:
                c = _role_model_card(ctx, sp, store, m)
        else:
            c = None
        if not c:
            continue
        assert words(c["text"]) <= MAX_WORDS, (sp, words(c["text"]), c["text"])
        s = ctx.stores.loc[store]
        cards.append({"salesperson_id": sp, "name": ctx.names[sp], "store_id": store, "city": s.city,
                      "state": s.state, "behaviour": c["behaviour"], "peer_id": c.get("peer"),
                      "peer_name": ctx.names.get(c.get("peer")), "source": c["source"],
                      "rupees": int(c.get("rupees", 0)), "text_en": c["text"]})
    return cards
