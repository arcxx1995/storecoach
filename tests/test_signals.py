"""Hidden-signal eval: the system must find each planted pattern AND name the right cause.

Run: python tests/test_signals.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from engine.cards import MAX_WORDS, build_cards  # noqa: E402
from engine.detectors import DAY, detect, make_ctx, role_models  # noqa: E402
from engine.load import load  # noqa: E402
from engine.metrics import data_issues  # noqa: E402
from engine.text import words  # noqa: E402


def find(issues, kind, **kw):
    hits = [i for i in issues if i["kind"] == kind and all(i.get(k) == v for k, v in kw.items())]
    assert hits, f"missing {kind} {kw}"
    return hits[0]


def main():
    for as_of in ["2026-10-01", "2026-10-31"]:
        ctx = make_ctx(load(as_of))
        issues = detect(ctx)
        keys = {i["key"] for i in issues}

        # More bills
        lv = find(issues, "leaver", store_id="LKO-02")
        assert lv["evidence"]["left"] == "SP1018", lv["evidence"]              # Imran C., not a staffing problem
        st = find(issues, "staffing", store_id="BLR-03")
        assert set(st["evidence"]["missing"]) >= {"SP1141", "SP1142"}, st["evidence"]  # Manjunath K., Vijay N.
        find(issues, "city_slowdown", city="Bengaluru")
        find(issues, "city_slowdown", city="Mysuru")
        assert "city_slowdown:Patna" not in keys, "Patna moves with the network; not a market problem"

        # Bigger baskets
        disc = find(issues, "discount_outlier", store_id="PAT-01")
        assert set(disc["track"]["ids"]) >= {"SP1064", "SP1065"}               # Manoj N., Sanjay K.
        assert "attach_gap:SP1087:sherwani" in keys                            # Arjun D.: safa/mojari/mala
        assert "category_avoid:SP1125:indo_western" in keys                    # Suresh K. avoids Indo-Western

        # Not a problem: data issues never become alerts
        assert not any(i.get("store_id") == "BLR-05" for i in issues), "new store must not be alerted"
        cards = build_cards(ctx, issues)
        assert all(words(c["text_en"]) <= MAX_WORDS for c in cards)
        assert all(c["peer_id"] is None or ctx.sp_store[c["peer_id"]] == c["store_id"] for c in cards)

    # More repeat: role model named
    assert any(m["salesperson_id"] == "SP1110" for m in role_models(ctx)), "Karthik J. (BLR-01) is the role model"

    # PAT-03 camera outage blocks conversion alerts while it's in the window
    ctx = make_ctx(load("2026-10-20"))
    assert "PAT-03" in ctx.camera_suspect
    assert not any(i["store_id"] == "PAT-03" and "conversion" in i["track"]["metric"] for i in detect(ctx))

    kinds = {(x["type"], x.get("store_id")) for x in data_issues(load())}
    assert {("footfall_zero_with_bills", "PAT-03"), ("placeholder_customer_id", "PAT-02"),
            ("new_store_no_baseline", "BLR-05")} <= kinds
    # Not a problem: Muzaffarpur is up year on year, so no city alert; small-store cards fall back to city peers
    ctx = make_ctx(load())
    assert not any(i["city"] in ("Muzaffarpur", "Kanpur") and i["kind"] == "city_slowdown" for i in detect(ctx))
    # BLR-05 (new store, nobody there qualifies) benchmarks against Bengaluru, but names no outside peer
    from engine.cards import _peers
    from engine.metrics import bill_metrics, window
    w = window(ctx.d.bills, "bill_date", ctx.E - 89 * DAY, ctx.E)
    m = bill_metrics(w, "salesperson_id").join(__import__("pandas").Series(ctx.sp_store, name="store_id"))
    peers, same = _peers(ctx, "SP1163", "BLR-05", m)
    assert len(peers) and not same and set(peers.store_id) <= {"BLR-01", "BLR-02", "BLR-03", "BLR-04"}
    assert any(x["type"] == "bill_on_off_day" for x in data_issues(load()))
    print("ok")


if __name__ == "__main__":
    main()
