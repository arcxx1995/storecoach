# Store Coach

*A daily coach for Manyavar stores. Built for the Manyavar (Vedant Fashions) AI Hackathon, brief A.*

```
   ┌──────────────────────────────────────────────────────────┐
   │   "Every morning, without anyone asking, tell each area   │
   │    manager which stores need attention and why, and tell  │
   │    each salesperson ONE thing to do better today."        │
   └──────────────────────────────────────────────────────────┘
```

# PART 1 — What it does (plain English)

## The idea

Imagine a smart assistant who reads every bill, every day, from every Manyavar store. Each morning it
writes a short note to each person: *"here is what to fix, here is how much money it is worth, here
is what to do today."* Nobody has to ask. It just shows up.

```
   YESTERDAY'S SHOP DATA                    THE COACH                      TODAY'S MESSAGES
  ┌─────────────────────┐            ┌───────────────────┐          ┌──────────────────────────┐
  │ bills, shoppers,    │            │  🔍 spots what's  │          │ 👔 Area manager:         │
  │ who worked, what    │  ───────►  │     going wrong   │  ──────► │   "Top 5 problems, with  │
  │ was bought          │            │  💰 puts a ₹ value│          │    ₹ at stake + a fix"   │
  └─────────────────────┘            │  ✍️  writes advice │          │                          │
                                     └───────────────────┘          │ 🧍 Salesperson:          │
                                                                    │   "One tip, 60 words,    │
                                                                    │    in your language"     │
                                                                    └──────────────────────────┘
```

## What a store can improve (the three "levers")

```
   MORE BILLS            BIGGER BASKETS           MORE REPEAT
   ──────────            ──────────────           ───────────
   Of the families       Customer buys a          Customer comes
   who walk in, more     sherwani... but no       back to buy
   should buy            safa or mojari.          again later.
   🚪➜🧾                 👘 ➜ 👘 + 🧣 + 👞         🔁🙂
```

## Who gets what

```
 ┌─────────────────────┬──────────────────────────────────────────────────┐
 │ AREA MANAGER        │ • At most 5 issues a week, biggest ₹ first       │
 │ (one per city)      │ • Each one says: what, why, and ONE action       │
 │                     │ • A short spoken briefing (voice note)           │
 │                     │ • Delivered on Telegram, in Hindi or Kannada     │
 ├─────────────────────┼──────────────────────────────────────────────────┤
 │ SALESPERSON         │ • A tiny card (60 words or fewer)                │
 │                     │ • One habit to change + a colleague in the same  │
 │                     │   store who does it well + one thing to do today │
 │                     │ • Also available as a short voice note           │
 └─────────────────────┴──────────────────────────────────────────────────┘
```

## What kind of advice it gives

- **Doable today.** "Keep 6 people on the floor Sat–Sun 4–8 pm." No budget, no approvals, no new tools.
- **Fair.** People are compared with colleagues in their own store first, then city, then state.
- **Not alarmist.** Normal wedding-season and festival ups and downs are ignored.
- **Honest about bad data.** If a number looks impossible (e.g. a broken door counter), it is set aside as a
  *data issue* and is **never** sent to a manager as if it were real.
- **Checks itself.** A week later it looks again and says: *got better / no change / got worse.*

## Examples of what it can notice

```
 • A top salesperson quietly left the store         → "Hire or cover, ₹X per month at risk"
 • Not enough staff on busy weekends                → "Move a weekly off, keep 6 on the floor"
 • A whole city is buying less than last year       → "Market problem, not one store's fault"
 • Customers buy a sherwani but never a safa        → "Offer the matching safa at billing"
 • One person gives far bigger discounts than peers → "Coach on discounting"
 • Door counter reads zero on busy days             → "Data issue, not shown to the manager"
```

## The screens (the website)

```
 ┌───────────────┐
 │ ▣ Dashboard   │  the big picture, pick a date range
 │ 👥 Area mgrs  │  each manager's top issues + voice briefing
 │ 🏬 Salesperson│  cards and voice notes, by city and store
 │ ⚠  Issues     │  everything found, sorted by severity (₹ at stake)
 │ ⟲  Follow-ups │  "did it get better a week later?"
 │ 🧑 Employees  │  the people list
 │ 🗄 Data issues│  numbers we don't trust, plus Telegram status
 └───────────────┘
```

## A day in the life

```
  07:00 IST   ⏰ coach wakes up on its own
     │
     ▼
  reads new data ──► finds problems ──► ranks by ₹ ──► writes short advice
     │
     ▼
  📱 Telegram message + 🔊 voice note to each area manager
  🖥  website updated for everyone
     │
     ▼
  7 days later: 🔎 "did it help?"
```

> Note: the data here is **synthetic** (made up for the hackathon) and runs from Nov 2024 to Oct 2026.
> The coach replays October 2026 day by day so you can see how it behaves.

---

# PART 2 — For developers

Everything below is the technical detail: stack, data, detectors, deploy and run steps.

```
   CSV / live API ─► engine (Python, pandas) ─► runs/<date>/*.json (+ mp3) ─► Next.js app (Vercel)
                          │                              ▲                         │
                          ├─ Sarvam (phrase + TTS)       └── Vercel Blob           └─ Telegram bot
                          └─ api/cron.py (Vercel Cron, daily)
```

| Folder | What lives there |
|---|---|
| `engine/` | Python: load, metrics, detectors, cards, digest, follow-up, Sarvam, Telegram delivery |
| `api/cron.py` | Vercel Python function run by Cron |
| `app/`, `lib/` | Next.js App Router UI, API routes (`chat`, `tts`, `telegram`), data helpers |
| `runs/` | Output per day (`runs/<as_of>/`) |
| `data/` | Bundled synthetic CSVs |
| `tests/`, `scripts/` | Python tests, mock API, Telegram setup |

## 1. Problem

Store Coach grows sales through three levers:

| Lever | Metric |
|---|---|
| More bills | Conversion = bills ÷ footfall |
| Bigger baskets | Items per bill, with packaging excluded |
| More repeat | Share of customers who bill again 30 or more days after their first bill |

It must meet these requirements:
- It runs on its own every day. No one has to ask it anything.
- **Area managers** get at most 5 issues a week, ranked by ₹ at stake. Each issue names the lever, the cause and one action.
- **Salespeople** get a card of 60 words or fewer. The card names one behaviour, a peer from the same store, and one action for today.
- **Every action** can be done today with the people and stock the store already has. No budget, approval or new system. It names who, what and when.
- **Follow-up.** A week later, it checks whether the number moved and says so.
- **Fair comparison.** Salespeople are compared with peers in their own store, then city, then state.
- **Not problems.** Normal festival and season swings and regional taste differences are not alerted. A number that cannot be right is flagged as a data issue and never sent to the area manager.

Judging criteria:
- Did the system find the hidden patterns and name the right cause?
- Are the numbers right? A spot-check finding a wrong number costs more than a missing feature.
- Can a store carry out each action today?
- Does it run on its own?

## 2. Data

The data pack is at `/Users/macbookpro/Downloads/manyavar-vch3-data/csv/`. It is synthetic and read-only.

- 20 stores in 6 cities and 3 states, with 6 area managers (one per city) and 175 salespeople.
- Sales run from 1 Nov 2024 to 31 Oct 2026, with 90,805 bills and 259,772 bill lines. "Today" in the data is 31 Oct 2026.
- The roster covers only 1 May to 31 Oct 2026.

Tables used: `stores`, `area_managers`, `salespeople`, `roster_daily`, `footfall_daily`, `bills`, `bill_lines`, `items`, `calendar`.

Gotchas:
- Load every file with `dtype=str`, because IDs are text. Convert number columns explicitly.
- Line revenue = `qty × selling_price`. Discount per unit = `mrp − selling_price`. All money is in ₹ and includes GST.
- Packaging lines (`is_packaging = 1`) are ₹0. There are about 84k of them. Exclude them from item counts.
- Safa, Mala and Stole are separate categories in `items`. `min_display` groups them as "Accessories".
- `area_managers.stores` is a comma-separated list in one cell.
- There is no exit date for salespeople, so leavers have to be inferred.

## 3. Findings so far

These come from profiling with the standard library. They are leads to check against detectors, not final answers.

| Finding | Treatment |
|---|---|
| PAT-03 footfall is **0** on days that have bills, from about 5 Oct 2026. The door camera looks dead. | Data issue. Do not alert Patna's area manager (AM-03) on conversion. |
| BLR-05 opened **10 Oct 2026**. It has 22 days of footfall and 3 salespeople. | No baseline. Exclude from peer comparison and note it in the data issues list. |
| Conversion is falling across whole cities: Mysuru from 9.3% to 7.9%, Muzaffarpur from 10.3% to 8.7%, Bengaluru from 14.4% to 12.4%. | Market problem. Raise it at city level, not against one store. Check YoY to rule out season. |
| About 43 salespeople have no bill since 15 Sep 2026. SP1138 (BLR-02) has no bills at all. | Most left long ago. Alert only on high performers who left recently (2026). |
| Placeholder customer **`C99999999`** is on about 2% of bills at every store. At **PAT-02** it rises to about 44% from 7 Aug 2026; SP1085, SP1083 and SP1087 enter it most. | Data issue. Any ID with more than 50 bills is treated as a dummy number and excluded from repeat. PAT-02's repeat can't be measured. |
| 11.1k of 75.5k customers have more than one bill. | Repeat baseline. Apply the 30-day rule and censoring. |
| No orphan keys, duplicate bills, or selling price above MRP. 3 items have a blank `launch_date`. | Clean otherwise. |

## 4. Architecture

```
Vercel Cron (daily 07:00 IST)
   │
   ▼
api/cron.py ── sync live data → run every missing day (oldest first) → Python (pandas) engine
   │   metrics → detectors → suppressors → rank → cap → phrase (Sarvam) → TTS (Bulbul)
   ▼
Vercel Blob  runs/{as_of}/
   ├─ digests.json      area manager issues (≤5/week)
   ├─ cards.json        salesperson cards (≤60 words, local + English)
   ├─ data_issues.json  quarantined numbers, never shown to area managers
   ├─ followups.json    week-later "did it move?" checks
   └─ audio/*.mp3       salesperson voice notes and area manager briefings
   │
   ▼
Next.js (App Router) on Vercel
   /                 run picker (as-of date)
   /am/[id]          area manager digest + briefing audio
   /stores, /stores/[id]  salesperson cards + voice notes by store
   /issues           data issues
   /followups        week-later outcomes
   /api/chat         ask-the-coach, grounded on that run's JSON
```

Environment variables: `SARVAM_API_KEY` and `BLOB_READ_WRITE_TOKEN`.

**Daily run in a frozen dataset.** The data ends on 31 Oct 2026. The engine takes `as_of` and uses only the data up to that date. Backfill runs for 1–31 Oct 2026. That way the app shows each day's alerts, and the follow-ups compare a run with the run 7 days later.

## 5. Build scope (MVP)

1. **Loader.** Typed loads, packaging filtered out, and data-issue checks run first.
2. **Metrics.** Computed per store, salesperson and day or week:
   - conversion
   - items per bill
   - average bill value
   - discount %
   - attach rate by pair
   - category mix
   - repeat rate
   - attendance
3. **Detectors**, following the brief:

   | Lever | Detector |
   |---|---|
   | Bills | Good salesperson has left or keeps missing shifts. Roster vs last bill. |
   | Bills | Understaffed on busy days. Present headcount vs footfall, weekends and wedding dates. |
   | Bills | Walk-ins steady while conversion falls. |
   | Bills | Whole city slowing down. Raised as a market problem. |
   | Baskets | Missing the obvious pair: safa, mojari or mala with a sherwani; jacket with a kurta. |
   | Baskets | Salesperson avoids a category their city buys. |
   | Baskets | Discount well above the store's norm. |
   | Repeat | Low-repeat stores or salespeople, and role models with high repeat to name as peers. |
   | Repeat | List of lapsed wedding customers to call. |

4. **Suppressors.**
   - Festival and wedding-season swings, using the calendar for each state and the same period last year (YoY).
   - Regional taste.
   - Impossible numbers, which go to `data_issues.json`.
5. **Rank** by ₹ at stake. Keep the **top 5 per area manager per week**, with a cooldown so the same issue is not repeated.
6. **Actions** come from fixed templates that name who, what and when, for example: "Keep 6 people on the floor Sat–Sun 4–8 pm; move Vikas's weekly off to Tue."
7. **Cards.** Each card has one behaviour, one peer from the same store and one action. Code computes the facts and Sarvam phrases them.
8. **Follow-up.** Re-measure the metric 7 days after each alert and report whether it improved, stayed flat or got worse.
9. **Replay backfill** and a Vercel Cron schedule.
10. **Next.js app** with the pages listed in the architecture section.

## 6. Areas to get right

- **₹ at stake. Use one explicit formula per lever and show it in the alert:**
  - Conversion: (peer or baseline conversion − actual) × footfall × average bill value
  - Basket: (peer attach rate − actual) × anchor bills × attach item average price
  - Repeat: (peer repeat rate − actual) × eligible customers × average bill value
  - Discount: (actual discount % − store norm) × revenue
- **Fair peers.**
  - Compare within the same store first, then city, then state.
  - Require a minimum sample, for example 30 bills or 14 roster days.
  - Shrink small samples toward the peer mean so new or part-time staff do not top or bottom the list.
- **Seasonality.**
  - Compare with the same weeks last year and with the store's own trend, not other tiers.
  - Weddings and festivals move volume. Use the `calendar` for each state.
- **Footfall is families.** Footfall counts groups walking in, so conversion is bills ÷ footfall. Only compare it within a store over time or among similar stores.
- **Leavers.** There is no exit date. A salesperson has left if they have no roster rows and no bills for 14 or more days. Rank leavers by their prior contribution, and alert only when it was material.
- **Missed shifts.** A missed shift is an "Off" pattern on busy days (weekends, wedding dates) compared with peers, not just total offs.
- **Repeat definition.**
  - A repeat is a bill 30 or more days after the customer's first bill.
  - Repeat is credited to the store and salesperson of the first bill.
  - Customers whose first bill was in the last 30 days are not yet eligible (right-censoring).
- **Data-issue quarantine.**
  - Zero footfall with bills, bills greater than footfall, stores with no baseline, and blank critical fields all go to `data_issues.json`.
  - Quarantined numbers never reach an area manager.
- **LLM guardrails.**
  - Code computes every number. Sarvam only phrases.
  - A validator checks that every digit in the output exists in the input JSON, that the card is 60 words or fewer, and that each named peer is in the same store.
  - If validation fails, the English template ships instead.
- **Hidden-signal eval.** `tests/test_signals.py` asserts that the known signals are found with the right cause:
  - PAT-03 camera
  - city declines
  - recent top-performer exits
  - attach gaps
  - discount outliers

  It also spot-checks the numbers against raw pandas.
- **Deterministic runs.** The same `as_of` date and data always give the same alerts, because LLM output is cached by content hash.
- **Action feasibility.** Every action uses the existing roster, stock and customers. Phone lists come from `customer_id` history, and this data pack holds no numbers in plain text.

## 7. Sarvam integration

| Use | Model | Notes |
|---|---|---|
| Phrase cards and digests | `sarvam-105b` via `/v1/chat/completions` | Structured facts go in as JSON and short text comes out. Hindi for UP and Bihar, Kannada for Karnataka, and English always generated as well. |
| Salesperson voice note | `bulbul:v3` TTS | About 20 seconds per card, in the city's language. |
| Area manager briefing | `bulbul:v3` TTS | 60-second spoken digest. |
| Ask-the-coach chat | `sarvam-105b` | `/api/chat` is grounded only in the selected run's JSON and refuses to answer outside it. |

- Cache phrasing and audio by a hash of the facts plus the language. Only call TTS again for cards that changed.
- `sarvam-m` and `sarvam-30b` are deprecated. Check the model IDs against the live docs at build time: <https://docs.sarvam.ai/api/getting-started/models>.
- The key stays server-side in Vercel env and is never sent to the browser.

## 8. Nice-to-haves (after MVP)

- Role-model leaderboard showing who brings customers back, as a peer to learn from.
- WhatsApp-style share view for cards and voice notes.
- Area manager "Done / Not done" button that feeds the follow-up.
- Drill-down from an alert to the bills and roster days behind it.
- "What changed since yesterday" diff on the area manager page.
- Saarika speech-to-text, so an area manager can ask the coach a question by voice.
- Weekly PDF export of the area manager digest.

## 9. Open questions

- The weights for ₹ at stake when levers compete. Use a plain ₹ comparison for now.
- The final list of attach pairs. Confirm it with the Manyavar contact in the room.
- The replay window. 1–31 Oct 2026 for now.

## 10. Run locally

```bash
source .venv/bin/activate
python -m engine.backfill                  # replays 1–31 Oct; Sarvam on the last day only (~130 calls)
python -m engine.run --as-of 2026-10-31    # one day; add --no-sarvam to skip translation/voice
python tests/test_metrics.py               # numbers vs raw CSV maths
python tests/test_signals.py               # planted patterns found with the right cause
npm run dev                                # http://localhost:3000
```

`hello_sarvam.py` needs `pip install sarvamai` (not in requirements.txt; the engine uses plain HTTP). `SARVAM_API_KEY` goes in `.env` (git-ignored). The CSVs are bundled in `data/`; set `STORECOACH_DATA` to use another folder.

## 11. What's built

| Part | File | Notes |
|---|---|---|
| Loader | `engine/load.py` | Typed load cut at `as_of`, bill totals without packaging, category flags, dummy-number flag, store-day table with calendar |
| Metrics | `engine/metrics.py` | Conversion (trusted camera days only), basket, discount, mix, attach, attendance, repeat, data issues |
| Detectors | `engine/detectors.py` | Leaver, busy-day staffing, city slowdown (vs last year and vs rest of network), conversion drop (significance-tested), attach gap, category avoidance (vs own city), discount outlier, low repeat, role models |
| Cards | `engine/cards.py` | One per active salesperson: biggest ₹ gap vs same-store peers, or a teach-a-colleague card for leaders |
| Digest | `engine/digest.py` | Rank by ₹, ≥ ₹5k for managers, max 5 per rolling week, 14-day cooldown, morning briefing |
| Follow-up | `engine/followup.py` | Re-measures each alert's metric for the 7 days after it: improved, not moved, got worse, or too early to tell |
| Sarvam | `engine/sarvam.py` | `sarvam-105b` translation with number/name validator + English fallback; `bulbul:v3` MP3; disk cache |
| Storage | `engine/store.py` | `runs/` locally; Vercel Blob (REST, public) when `BLOB_READ_WRITE_TOKEN` is set |
| Cron | `api/cron.py`, `vercel.json` | Daily 07:00 IST; skips if the day already ran (data ends 31 Oct) |
| App | `app/` | Area manager digests + briefing audio + chat, store cards + voice notes, all issues, follow-ups, data issues |

## 12. Deploy (Vercel)

1. `vercel link`, then connect a **public** Blob store, which sets `BLOB_READ_WRITE_TOKEN`.
2. `vercel env add SARVAM_API_KEY` and `vercel env add CRON_SECRET`.
3. Seed Blob with the October replay: `BLOB_READ_WRITE_TOKEN=… python -m engine.backfill`.
4. `vercel deploy --prod`. The cron then runs `api/cron.py` every morning.

## 13. Running daily against a live API

Without `LIVE_API_URL` the engine reads `data/*.csv` (the October replay). With it, the cron does this each morning:

1. `engine.source.sync()` pulls new rows into `snapshot/<table>.csv` (re-fetching the last 3 days for late corrections).
2. `data_end` = last day that has both bills and footfall. Days from the last run up to `min(yesterday IST, data_end)` run oldest first, at most 3 per call. Only the newest gets Sarvam translation and audio.
3. If the data is not there yet the call returns 202 and the next call picks up where it stopped. A run writes `index.json` last, so a run that died half-way is redone.
4. A lock (`lock.json`) stops overlapping calls; Sarvam gets a deadline and falls back to English if the 300 s budget runs short.

API contract (Bearer `LIVE_API_TOKEN` if set): `GET {LIVE_API_URL}/<table>?since=YYYY-MM-DD` returns a JSON array of rows or CSV with the same columns as `data/<table>.csv`. Transactional tables (`bills`, `bill_lines`, `footfall_daily`, `roster_daily`) honour `since`; masters (`stores`, `items`, `calendar`, `salespeople`, `area_managers`) return everything. Publish only complete days.

Env: `CRON_SECRET` is required (the endpoint refuses without it), `LIVE_API_URL`, `LIVE_API_TOKEN`, `BLOB_READ_WRITE_TOKEN`, `SARVAM_API_KEY`.
Vercel Hobby allows one cron run per day (`vercel.json` is daily, 07:00 IST); on Pro use an hourly schedule such as `0 1-6 * * *` to retry until data lands.

Try it offline: `python scripts/mock_api.py --through 2026-10-05`, then `LIVE_API_URL=http://127.0.0.1:8765 python -m engine.run`. Tests: `python tests/test_source.py && python tests/test_cron.py`.

## 14. Telegram delivery

After the newest day runs, `engine/deliver.py` sends each area manager a Telegram message (their briefing in Hindi or Kannada, the new issues with who/what/when, last week's results) and the voice briefing as an audio message. A quiet day gets a short all-clear. Status per manager is in `runs/<date>/delivered.json` and on the Data issues page; a manager already delivered is never sent twice (`?resend=1` overrides).

Setup (one time, you):
1. In Telegram, talk to `@BotFather`, `/newbot`, copy the token into `TELEGRAM_BOT_TOKEN`.
2. Set `TELEGRAM_SECRET` to a long random string (letters, digits, `_`, `-`). Set it, the bot token, `BLOB_READ_WRITE_TOKEN` and `APP_URL` in Vercel, then deploy to production. The app registers its own webhook on first start (`instrumentation.ts`); `python scripts/telegram_setup.py --status` shows the webhook URL (`--webhook https://<app>` is the manual fallback).
3. `python scripts/telegram_setup.py --links` prints your **admin link**. Open it once and press Start: you are now the approver.

Each area manager (one time): open the shared bot link, press **Start**, tap their own name. You get "X says they are AM-01 ... [Approve] [Reject]" in Telegram; one tap connects them and the bot tells them. `--status` (or the Data page) shows who is connected.

Personal links: `--links` prints one per manager. Opening one connects that manager without approval, and **the first chat to use a link keeps it**: a second person is told the link was already used, and the same person pressing again is told they are already connected. To free a slot (new phone, new manager), run `python scripts/telegram_setup.py --reset AM-01`; the next person to open the link then owns it. Send each link only to its manager.

A link only works for its own manager (the code is an HMAC of the manager id), so nobody can claim another manager's slot. Changing `TELEGRAM_SECRET` invalidates all old links. `DELIVERY_RECIPIENTS` still works as a manual override. Saved chat ids sit in the public run store next to the digests; a chat id alone cannot message anyone without the bot token.

`DELIVERY_DRY_RUN=1` prints the messages instead of sending. A manager with no `chat_id` is skipped without an error; one who blocked the bot is marked failed and the others still go out. Tests: `python tests/test_deliver.py`.

