"""Where runs live. Local folder by default; Vercel Blob when BLOB_READ_WRITE_TOKEN is set.

Blob REST protocol mirrors @vercel/blob put() (node_modules/@vercel/blob/dist, API version 13).
"""
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

RUNS = Path(os.environ.get("RUNS_DIR", Path(__file__).resolve().parent.parent / "runs"))
TOKEN = os.environ.get("BLOB_READ_WRITE_TOKEN")
STORE_ID = TOKEN.split("_")[3] if TOKEN else None
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


def read_json(rel: str):
    if TOKEN:
        try:
            with urllib.request.urlopen(f"{PUBLIC}/runs/{rel}", timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            raise
    p = RUNS / rel
    return json.loads(p.read_text()) if p.exists() else None


def run_dates() -> list[str]:
    if TOKEN:
        return (read_json("index.json") or {}).get("dates", [])
    return sorted(p.name for p in RUNS.glob("20??-??-??") if (p / "digests.json").exists())
