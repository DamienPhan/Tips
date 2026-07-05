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

**Two domain entities**, both synced the same way: `missions` (an intervention/job) and `work_shifts` (a workday, used to compute €/hour — also doubles as the record of OFF days, worked or not, see the Shift/overtime math note below). Postgres schema, including RLS policies scoped by `auth.uid() = user_id`, is in `supabase/schema.sql`.

**Offline-first sync model** (`src/lib/sync.js`, backed by `src/lib/db.js`):
- Every record gets a client-generated UUID at creation time, making writes idempotent (`upsert`) — safe to retry without creating duplicates.
- Local writes go to Dexie first (`syncStatus: 'pending'`), then `flush()`/`flushShifts()` push pending/`error`/`pending-delete` rows to Supabase opportunistically (on save, on `online` event, on app init via `initSync()`). Rows that fail to sync are marked `error` and are **retried on every subsequent flush**, not dropped.
- Deletes go through the same queue: `deleteMission`/`deleteShift` delete immediately (local + remote) when online and the remote call succeeds; otherwise the row is kept locally and flipped to `syncStatus: 'pending-delete'` so the deletion is retried and propagated once back online, instead of being silently lost. `loadAll()`/`loadShifts()` filter out `pending-delete` rows so they disappear from the UI immediately regardless.
- `pullFromServer()`/`pullShifts()` merge remote rows into Dexie, but **skip any local row still `pending`, `error`, or `pending-delete`** so an unsynced local write/delete is never clobbered by a stale server read. The `online` event handler runs `pullFromServer`/`pullShifts` after flushing, so reconnecting also reconciles rows changed remotely (e.g. from another device) while this one was offline.
- `useOnline.js`'s `useSyncStatus(missions, shifts)` counts pending/error/pending-delete rows across **both** tables for the sync indicator in `App.jsx` — pass both arrays, not just `missions`, or shift-only changes won't refresh the badge.
- Each entity module (`saveMission`/`saveShift`, etc.) whitelists a fixed `COLUMNS`/`SHIFT_COLUMNS` array before writing to Supabase — when adding a new field to a mission or shift, update both the Postgres schema and this column whitelist, or it will silently not sync.

**State layer** (`src/store/missions.js`): a single zustand store (`useMissions`) holding both `missions` and `shifts` in memory, backed entirely by the `sync.js` functions above — components never talk to Dexie or Supabase directly.

**Text-paste import pipeline** (`src/lib/parseImport.js` → `parseReport.js` / `parseShift.js`): the user pastes freeform report text (from the external scheduling tool) into `ImportModal`; `parseImport` sniffs the content (`Booking #` → mission reports, a `d/m : Hh - Hh` pattern → shift ranges) and routes to the matching regex-based parser. These parsers are tolerant/best-effort (French labels, accented/unaccented variants, `OUI`/`NON`-style booleans) — when extending them, follow the existing pattern of one `val(text, 'Label')`-style field extractor per field rather than a single monolithic regex.

**Shift/overtime math** (`src/lib/parseShift.js`): shifts are stored as `start_min`/`end_min` (minutes from midnight, wrapping past 1440 for overnight shifts). Night hours are 22:00–07:00. Overtime is "worked beyond 8h30 (`BASE_SHIFT_MIN`)", except on a declared day off (`is_day_off`) where the *entire* shift counts as overtime (`overtimeMin()`). `overtimePayMin()`/`night_overtime_hours` no longer bake in any day-off premium — `overtime_hours`/`night_overtime_hours` are plain, unmultiplied durations regardless of `is_day_off`; the pay premium is applied later, only in `src/lib/payroll.js`. Night-overtime is computed as the overlap between the night window and the *tail* of the shift (overtime is defined as occurring at the end of the shift). If you change shift editing logic, use `recompute()` to keep `hours`/`overtime_hours`/`night_hours`/`night_overtime_hours` consistent rather than recalculating ad hoc. A **rest day** (day off, not worked at all) reuses the same `is_day_off` flag but with `start_min`/`end_min` both `0` — `recompute({start_min:0,end_min:0}, true)` naturally yields all-zero fields, no schema change or new column needed. `isRestDay(shift)` (`is_day_off && !hours`) is the single predicate distinguishing this from a worked day off, used everywhere it's displayed (`Calendar.jsx`'s grid label and day-detail panel, `shiftRows.js`'s `shiftRowCells`). For **display/export purposes** (`summary.js`'s `overtime`/`offWorked`, `monthlyDetail.js`'s totals and the `Sup`/`OFF trav.` export columns, `Home.jsx`'s "Heures travaillées (OFF)" tile), normal overtime and worked-day-off hours are still split on `is_day_off` and shown as separate figures. But for **payroll purposes** (`src/lib/payroll.js`), they are merged into a single monthly overtime pool and majorated by the same tiered rule: the first 34h of combined overtime (normal + OFF-worked) in the month at +25%, anything beyond 34h at +50% — a day off worked is not a separate pay category anymore, it's just more overtime hours feeding the same monthly threshold.

**Calendar day-detail panel** (`src/components/Calendar.jsx`): the panel below the grid is a 4-way branch on `editing`/`selShift`/`isRestDay(selShift)`, in that priority order — the time-entry form, a dedicated "Jour OFF — non travaillé" block (offers "Ajouter des horaires" to convert it into a worked day off, or delete it), the full worked-shift breakdown (Row list + the "Marquer ce jour comme OFF travaillé" toggle), and finally the empty-day state which now offers two actions side by side: "Ajouter shift" (header button, opens the time form) and "Marquer comme jour OFF (non travaillé)" (creates the zero-hour rest-day shift directly, no form). The small red dot drawn on any `is_day_off` grid cell is the same one the legend's "jour OFF" entry has always described — it just wasn't actually rendered until the rest-day feature was added.

**Stats/aggregation** (`src/lib/aggregate.js`, `summary.js`, `charts.js`): three modules compute overlapping-but-distinct views (bucketed history by day/week/month/year, current-period totals, chart-ready bar data) from the same `missions`/`shifts` arrays — but **`aggregate.js` is currently dead code, not imported anywhere** (verified: no file references it); don't assume its `tipPerHour`/`tipPerPax` logic is live just because it exists, and don't bother keeping it in sync with a change unless something starts importing it. ISO week numbering is duplicated in **three** live places (`summary.js`, `charts.js`, and inline in `Home.jsx` for the period-nav label — `aggregate.js` has a fourth, unused copy) — keep the live ones in sync if fixing week-boundary bugs. `no_show` missions are excluded from pax/tip-per-pax ratios but still count toward `count`/`tips`.

**Home's period navigation** (`src/components/Home.jsx`): the Semaine/Mois/Année tabs pair with a `refDate` state and ‹›  arrows that step `refDate` by one unit of the selected period (`shiftRefDate`); `summary(missions, shifts, period, refDate)` already accepts an arbitrary reference date, which is what makes this work — the "next" arrow disables once `periodKey(period, refDate)` matches today's, so you can't scroll into the empty future. Switching tabs resets `refDate` back to now. The "Moyenne par jour travaillé" card is always scoped to the calendar month of `refDate` (`d.getFullYear()`/`d.getMonth()`, independent of which tab is active) rather than all-time history, with a small month/year label next to its title so the scope stays visible even on the Semaine/Année tabs.

**Amount privacy blur** (`src/components/Home.jsx`): every € figure on Accueil (Gains totaux, the bar-chart values/tap-detail, the daily-average and Max/Min, and the dispatch split) is blurred behind a single page-wide `revealed` boolean and only clears on tap, via the local `Amt` wrapper component (`filter: blur(...)`, toggled `onClick`). Only the main "Gains totaux" figure carries an explanatory hint ("Touche le montant pour l'afficher") — new amounts added to this page should reuse `Amt`/`revealed`/`toggleRevealed` without adding their own hint text.

**Dates**: always stored/compared as `YYYY-MM-DD` local-date strings (`src/lib/date.js`: `todayLocal()`/`parseLocal()`), specifically to avoid UTC-shift bugs — never use `new Date(dateString)` directly on these values.

**Export** (`src/lib/exportPayroll.js`): the standalone hours-only export (formerly `exportData.js`'s `ExportSection` on `Home.jsx`) has been folded into the Paie tab — `exportPayrollPdf`/`exportPayrollXlsx` generate the payroll summary *and* the day-by-day hours detail (shared row-formatting helpers in `src/lib/shiftRows.js`, `SHIFT_TABLE_HEAD`/`shiftRowCells`) in one `.pdf` (via `jspdf`) or `.xlsx` (via `xlsx`) file, both dynamically imported to keep them out of the main bundle. Both take the `[{key, label, rows, payroll}]` shape produced by `computePayroll()` (`src/lib/payroll.js`), which itself groups shifts by month via `monthlyDetail()` (`src/lib/monthlyDetail.js`).

**Dispatch split** (`src/lib/dispatch.js`): `DISPATCH_RATE` (10%) is applied to compute the share owed back to dispatch vs. net kept. `lastMonthTips()` scopes this to the previous calendar month only (used by `Home.jsx`'s "Partage dispatch" section); `tipsByMonth()` is the older all-history-grouped-by-month variant, kept for now but currently unused by that section.

**Only `App.jsx`'s import graph is live.** It renders `Auth`, `Home`, `Calendar`, `MissionsList`, `MissionForm`, `ImportModal` — that's the entire component tree. If you're exploring `src/components/`, don't assume a file is wired in just because it exists; verify it's reachable from `App.jsx` before treating its logic as current behavior. (Five stale/superseded components — `Charts.jsx`, `Stats.jsx`, `DayTotal.jsx`, `Shifts.jsx`, `ImportReport.jsx` — were removed for this reason; their functionality is already covered by `Home.jsx`, `Calendar.jsx`, and `ImportModal.jsx`.)

## Review subagents

Since there's no test suite, review is the only correctness gate before shipping. Two project subagents (`.claude/agents/`) exist for this — use `sync-invariant-reviewer` proactively after any change to `src/lib/sync.js`, `src/lib/db.js`, `src/store/missions.js`, or any `save*`/`delete*` function for missions/shifts (it checks the pending/error/pending-delete state machine and the "don't clobber locally-dirty rows on pull" rule); use `code-reviewer` for everything else.
