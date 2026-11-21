"""Small unit checks: TTS chunking, translation validator, follow-up catch-up. Run: python tests/test_units.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from engine.sarvam import _chunks, valid  # noqa: E402

t = " ".join(f"Sentence number {i} is here." for i in range(300))
c = _chunks(t)
assert all(len(x) <= 2500 for x in c) and " ".join(c) == t
assert valid("Gap 13% on Sat 7 Nov", "13% Sat 7 Nov")
assert not valid("Gap 13%", "13% and 40%"), "invented number must fail"
assert not valid("Gap 13%", "gap"), "dropped number must fail"

from engine.text import weekend  # noqa: E402
assert weekend("2026-10-30") == ("Sat 31 Oct", "Sun 1 Nov")  # Fri run -> Sat morning
assert weekend("2026-10-31") == ("Sun 1 Nov", "Sat 7 Nov")   # Sat run -> Sunday morning: today counts
assert weekend("2026-10-27") == ("Sat 31 Oct", "Sun 1 Nov")
print("ok")
