<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Store Coach: agent notes

Daily coach for Manyavar stores (hackathon brief A). Python engine writes JSON per day; Next.js app reads it.
Full spec and run steps: `README.md` (Part 2).

## Layout
- `engine/` pandas pipeline: `load` → `metrics` → `detectors` → `digest`/`cards` → `followup` → `sarvam` → `deliver`. Entry: `python -m engine.run --as-of YYYY-MM-DD`.
- `api/cron.py` Vercel Cron entry (daily). `vercel.json` holds the schedule.
- `app/` Next.js App Router pages (`am`, `stores`, `issues`, `followups`, `employees`, `data`) and API routes (`chat`, `tts`, `telegram`). `lib/data.ts` reads runs from Blob or `runs/`.
- `runs/<date>/` generated output. `data/` synthetic CSVs, read-only.

## Rules that matter
- Code computes every number; the LLM (Sarvam) only phrases. Validator falls back to the English template.
- Impossible numbers go to `data_issues.json`, never to area managers.
- Max 5 issues per area manager per week, ranked by ₹ at stake. Cards are 60 words or fewer, peer from the same store.
- Load CSVs with `dtype=str`. Exclude packaging lines (`is_packaging = 1`) from item counts.
- Runs are deterministic per `as_of`; do not hand-edit `runs/`, regenerate it.
- Never commit `.env*`. Secrets: `SARVAM_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_SECRET`.

## Commands
```
source .venv/bin/activate
python -m engine.run --as-of 2026-10-31 --no-sarvam
python tests/test_metrics.py && python tests/test_signals.py && python tests/test_deliver.py
npm run dev
```
