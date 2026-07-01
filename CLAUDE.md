# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-user (mono-utilisateur) mobile-first PWA for tracking airport-porter missions ("interventions") and tips ("pourboires"). It's a personal app, separate from the (external) schedule-extractor tool — it only consumes reports produced elsewhere. All UI copy, comments, and domain terms are in French; keep new code consistent with that.

## Commands

```
npm install
npm run dev       # vite dev server
npm run build      # production build to dist/
npm run preview    # preview the production build
```

There is no test suite and no linter configured in this repo.

Requires `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see README.md for full Supabase project setup — schema lives in `supabase/schema.sql` and must be run manually in the Supabase SQL editor; public signups must be disabled since this is single-user).

## Architecture

**Stack**: React + Vite, Tailwind CSS v4 (config lives in `@theme` inside `src/index.css`, not a tailwind.config file), zustand for state, Dexie (IndexedDB) for local cache, Supabase (Postgres + Auth) as the remote source of truth, vite-plugin-pwa for installability.

**Two domain entities**, both synced the same way: `missions` (an intervention/job) and `work_shifts` (a workday, used to compute €/hour). Postgres schema, including RLS policies scoped by `auth.uid() = user_id`, is in `supabase/schema.sql`.

**Offline-first sync model** (`src/lib/sync.js`, backed by `src/lib/db.js`):
- Every record gets a client-generated UUID at creation time, making writes idempotent (`upsert`) — safe to retry without creating duplicates.
- Local writes go to Dexie first (`syncStatus: 'pending'`), then `flush()`/`flushShifts()` push pending rows to Supabase opportunistically (on save, on `online` event, on app init via `initSync()`).
- `pullFromServer()`/`pullShifts()` merge remote rows into Dexie, but **skip any local row still `pending` or `error`** so an unsynced local edit is never clobbered by a stale server read.
- `useOnline.js` exposes online/pending-count state consumed by the sync indicator in `App.jsx`.
- Each entity module (`saveMission`/`saveShift`, etc.) whitelists a fixed `COLUMNS`/`SHIFT_COLUMNS` array before writing to Supabase — when adding a new field to a mission or shift, update both the Postgres schema and this column whitelist, or it will silently not sync.

**State layer** (`src/store/missions.js`): a single zustand store (`useMissions`) holding both `missions` and `shifts` in memory, backed entirely by the `sync.js` functions above — components never talk to Dexie or Supabase directly.

**Text-paste import pipeline** (`src/lib/parseImport.js` → `parseReport.js` / `parseShift.js`): the user pastes freeform report text (from the external scheduling tool) into `ImportModal`; `parseImport` sniffs the content (`Booking #` → mission reports, a `d/m : Hh - Hh` pattern → shift ranges) and routes to the matching regex-based parser. These parsers are tolerant/best-effort (French labels, accented/unaccented variants, `OUI`/`NON`-style booleans) — when extending them, follow the existing pattern of one `val(text, 'Label')`-style field extractor per field rather than a single monolithic regex.

**Shift/overtime math** (`src/lib/parseShift.js`): shifts are stored as `start_min`/`end_min` (minutes from midnight, wrapping past 1440 for overnight shifts). Night hours are 22:00–07:00. Overtime is "worked beyond 8h30 (`BASE_SHIFT_MIN`)", except on a declared day off (`is_day_off`) where the *entire* shift counts as overtime. Night-overtime is computed as the overlap between the night window and the *tail* of the shift (overtime is defined as occurring at the end of the shift). If you change shift editing logic, use `recompute()` to keep `hours`/`overtime_hours`/`night_hours`/`night_overtime_hours` consistent rather than recalculating ad hoc.

**Stats/aggregation** (`src/lib/aggregate.js`, `summary.js`, `charts.js`): three separate modules compute overlapping-but-distinct views (bucketed history by day/week/month/year, current-period totals, chart-ready bar data) all from the same `missions`/`shifts` arrays. ISO week numbering is duplicated in three places (`aggregate.js`, `summary.js`, `charts.js`) — keep them in sync if fixing week-boundary bugs. `no_show` missions are excluded from pax/tip-per-pax ratios but still count toward `count`/`tips`.

**Dates**: always stored/compared as `YYYY-MM-DD` local-date strings (`src/lib/date.js`: `todayLocal()`/`parseLocal()`), specifically to avoid UTC-shift bugs — never use `new Date(dateString)` directly on these values.

**Export** (`src/lib/exportData.js`): generates monthly hours summaries as `.xlsx` (via `xlsx`) and `.pdf` (via `jspdf`), both dynamically imported to keep them out of the main bundle.
