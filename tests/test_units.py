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
print("ok")
