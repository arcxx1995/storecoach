"""Where runs live. Local folder by default; Vercel Blob when BLOB_READ_WRITE_TOKEN is set.

Blob REST protocol mirrors @vercel/blob put() (node_modules/@vercel/blob/dist, API version 13).
"""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

RUNS = Path(os.environ.get("RUNS_DIR", Path(__file__).resolve().parent.parent / "runs"))
TOKEN = os.environ.get("BLOB_READ_WRITE_TOKEN")
STORE_ID = TOKEN.split("_")[3] if TOKEN and TOKEN.count("_") >= 3 else None  # vercel_blob_rw_<store>_<secret>
PUBLIC = f"https://{STORE_ID}.public.blob.vercel-storage.com" if STORE_ID else None
TYPES = {".json": "application/json", ".mp3": "audio/mpeg"}


def write_json(rel: str, obj) -> None:
    write_bytes(rel, json.dumps(obj, indent=1, ensure_ascii=False, default=str).encode())


def write_bytes(rel: str, data: bytes) -> None:
    if TOKEN:
        q = urllib.parse.urlencode({"pathname": f"runs/{rel}"})
        req = urllib.request.Request(f"https://vercel.com/api/blob/?{q}", data=data, method="PUT", headers={
            "authorization": f"Bearer {TOKEN}", "x-api-version": "13", "x-vercel-blob-store-id": STORE_ID,
            "x-vercel-blob-access": "public", "x-add-random-suffix": "0", "x-allow-overwrite": "1",
            "x-content-type": TYPES.get(Path(rel).suffix, "application/octet-stream"),
            "x-cache-control-max-age": "60"})
        urllib.request.urlopen(req, timeout=60).read()
        return
    p = RUNS / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)


def read_bytes(rel: str) -> bytes | None:
    if TOKEN:
        for k in range(3):
            try:
                with urllib.request.urlopen(f"{PUBLIC}/runs/{rel}", timeout=30) as r:
                    return r.read()
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    return None
                if k == 2:
                    raise
            except (urllib.error.URLError, TimeoutError):
                if k == 2:
                    raise
            time.sleep(2 ** k)
    p = RUNS / rel
    return p.read_bytes() if p.exists() else None


def read_json(rel: str):
    b = read_bytes(rel)
    return json.loads(b) if b is not None else None


def run_dates() -> list[str]:
    """Completed runs. index.json is written last, so a half-written run is not listed (and gets redone)."""
    idx = read_json("index.json")
    if idx is not None:
        return idx.get("dates", [])
    return sorted(p.name for p in RUNS.glob("20??-??-??") if (p / "digests.json").exists())  # pre-index local runs
