"""Sarvam: phrase English templates in Hindi/Kannada (sarvam-105b) and voice them (bulbul:v3).

The LLM never computes anything. Every number in the English text must survive translation, or the
English text ships instead. Responses are cached on disk by content hash, so replays are deterministic
and only changed cards cost an API call.
"""
import base64
import hashlib
import json
import os
import re
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = "https://api.sarvam.ai"
CHAT_MODEL = os.environ.get("SARVAM_CHAT_MODEL", "sarvam-105b")
TTS_MODEL = os.environ.get("SARVAM_TTS_MODEL", "bulbul:v3")
SPEAKER = os.environ.get("SARVAM_SPEAKER", "shubh")
CACHE = Path(os.environ.get("SARVAM_CACHE", ROOT / ".cache" / "sarvam"))
LANG_NAME = {"hi-IN": "Hindi", "kn-IN": "Kannada", "en-IN": "English"}
_DIGITS = str.maketrans("०१२३४५६७८९೦೧೨೩೪೫೬೭೮೯", "0123456789" * 2)


def _load_env():
    """Read SARVAM_API_KEY from .env if not exported. ponytail: no python-dotenv for 5 lines."""
    p = ROOT / ".env"
    if p.exists() and not os.environ.get("SARVAM_API_KEY"):
        for line in p.read_text().splitlines():
            k, _, v = line.partition("=")
            if k.strip() and not k.startswith("#"):
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_env()


def enabled() -> bool:
    return bool(os.environ.get("SARVAM_API_KEY"))


def _post(path: str, body: dict, timeout=90, tries=5) -> dict:
    req = urllib.request.Request(
        API + path, data=json.dumps(body).encode(), method="POST",
        headers={"api-subscription-key": os.environ["SARVAM_API_KEY"], "content-type": "application/json"})
    for k in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503) or k == tries - 1:
                raise
            time.sleep(float(e.headers.get("retry-after") or 2 ** k))  # rate limit: back off and retry


def _cache(kind: str, payload: dict, ext: str, fn):
    h = hashlib.sha256((kind + json.dumps(payload, sort_keys=True, ensure_ascii=False)).encode()).hexdigest()[:32]
    p = CACHE / f"{h}.{ext}"
    if p.exists():
        return p.read_bytes()
    out = fn()
    if out is not None:
        CACHE.mkdir(parents=True, exist_ok=True)
        p.write_bytes(out)
    return out


def numbers(s: str) -> set:
    return set(re.findall(r"\d+(?:\.\d+)?", s.translate(_DIGITS)))


def valid(src: str, out: str, max_words=None, keep=()) -> bool:
    """Every number and every name in the English must appear in the translation; word cap holds."""
    if not out or not numbers(src) <= numbers(out):
        return False
    if any(k and k not in out for k in keep):
        return False
    return max_words is None or len(out.split()) <= max_words


SYSTEM = (
    "You translate short coaching messages for salespeople and area managers at Manyavar, an Indian "
    "ethnic menswear store, from English into {lang}. Rules: write simple spoken {lang}, as a store "
    "manager would say it. Keep every number exactly as written with Western digits 0-9 (13%, ₹1.2 lakh, "
    "Sat 7 Nov). Keep people's names and store codes (like LKO-02) exactly as written in Latin letters. "
    "Product words like sherwani, kurta, mojari, safa, mala, stole, jacket and MRP may stay as they are "
    "usually said. Refer to people with respectful plural forms (Hindi वे/करते हैं, Kannada ಅವರು/ಮಾಡುತ್ತಾರೆ), "
    "never gendered singular forms. Do not add or drop any fact. Output only the translation."
)


def translate(text: str, lang: str, max_words=None, keep=()) -> str | None:
    """English -> lang via sarvam-105b. None if disabled, failed, or the result fails validation."""
    if lang == "en-IN" or not enabled():
        return None
    body = {"model": CHAT_MODEL, "temperature": 0.2, "max_tokens": 1200, "reasoning_effort": None,
            "messages": [{"role": "system", "content": SYSTEM.format(lang=LANG_NAME[lang])},
                         {"role": "user", "content": text}]}

    def call():
        try:
            r = _post("/v1/chat/completions", body)
            out = (r["choices"][0]["message"].get("content") or "").strip()
            out = re.sub(r"<think>.*?</think>", "", out, flags=re.S).strip()
            return out.encode() if valid(text, out, max_words, keep) else None
        except Exception as e:  # network/API errors fall back to English; logged, never fatal
            print(f"sarvam translate failed: {e}")
            return None

    out = _cache("chat", body, "txt", call)
    return out.decode() if out else None


def tts(text: str, lang: str) -> bytes | None:
    if not enabled() or not text:
        return None
    body = {"text": text[:2500], "language_code": lang, "model": TTS_MODEL, "speaker": SPEAKER,
            "pace": 1.0, "speech_sample_rate": 22050, "output_audio_codec": "mp3"}

    def call():
        try:
            return base64.b64decode(_post("/text-to-speech", body)["audios"][0])
        except Exception as e:
            print(f"sarvam tts failed: {e}")
            return None

    return _cache("tts", body, "mp3", call)


def pmap(fn, items, workers=8):
    with ThreadPoolExecutor(workers) as ex:
        return list(ex.map(fn, items))
