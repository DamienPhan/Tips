---
name: run-tips
description: Build, run, and drive the Tips (rapports-missions) PWA — a React+Vite mobile app for airport-porter missions/tips tracking. Use when asked to start the app, build it, take a screenshot of its UI, or interact with a running instance (Accueil/Calendrier/Missions/Paie tabs, import flow, mission form).
---

This is a React + Vite single-page PWA (no server-side rendering, no test
suite). It's driven headlessly with a small Playwright script,
`.claude/skills/run-tips/driver.mjs` — a chromium-cli-style REPL that reads
line-delimited commands from stdin. There is no `chromium-cli` binary in this
container, hence the custom driver.

All paths below are relative to the repo root (`/home/user/Tips`).

## Prerequisites

Nothing to `apt-get install` — this container already has Chromium and
Playwright's Node package pre-installed globally:

- Browsers at `/opt/pw-browsers` (`PLAYWRIGHT_BROWSERS_PATH` is already set
  in the environment).
- The `playwright` npm package itself at
  `/opt/node22/lib/node_modules/playwright` (global, `npm ls -g`). It is
  **not** a dependency of this repo (adding a browser-automation package to
  a production PWA's `package.json` isn't warranted just for this harness),
  so `driver.mjs` resolves it with a fallback: try normal `import('playwright')`
  first, then fall back to `createRequire` pointed at the global install. If
  you're on a machine without that global install, `npm install playwright`
  locally in the repo (or in this skill dir) and the normal import path
  picks it up automatically — no driver changes needed.

Node is already on PATH (`node -v` → v22).

## Setup

```bash
npm install
```

`.env.local` must exist with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
(see README.md). **You do not need real Supabase credentials to run and
drive this app** — see "Auth bypass" below. This container's `.env.local`
already has placeholder values:

```
VITE_SUPABASE_URL=https://fake.supabase.co
VITE_SUPABASE_ANON_KEY=fake-anon-key
```

## Build

```bash
npm run build
```

Verified: produces `dist/` (~940 KB largest chunk is `exceljs`, dynamically
imported — see CLAUDE.md's export notes). Takes ~13s. Not required to drive
the app (the dev server serves unbundled), but confirms the app isn't broken
before investing time driving it.

## Run (agent path)

### 1. Start the dev server

```bash
nohup npm run dev -- --port 5173 --strictPort > /tmp/tips-dev.log 2>&1 &
echo $! > /tmp/tips-dev.pid
timeout 30 bash -c 'until curl -sf http://localhost:5173 >/dev/null; do sleep 1; done'
```

Stop it with `kill $(cat /tmp/tips-dev.pid)` before relaunching, or the next
run hits `EADDRINUSE`.

### 2. Drive it with `driver.mjs`

Pipe a script to stdin (each command blocks until it finishes — commands
queue, so you never race `launch` against the command right after it):

```bash
node .claude/skills/run-tips/driver.mjs <<'EOF'
launch http://localhost:5173
wait-for text=Connexion
seed-auth
reload
wait-for text=Accueil
screenshot home
console-errors
quit
EOF
```

Screenshots land in `/tmp/tips-shots/<name>.png` (override with
`SHOTS_DIR=...`). This exact script was run in this session and produced a
real screenshot of the rendered Home tab (Gains totaux, stat tiles,
Répartition par service, etc.) — see Gotchas for why `seed-auth` + `reload`
is required before anything past the login screen is reachable.

| command | what it does |
|---|---|
| `launch <url>` | Launches headless Chromium, opens a page, navigates to `<url>` |
| `goto <url>` | Navigate the existing page |
| `reload` | Reload the current page |
| `seed-auth [projectRef]` | Injects a fake-but-valid Supabase session into `localStorage` so the app treats you as logged in (see Gotchas). Defaults to `fake`, matching this repo's `.env.local`. Requires having navigated to the app's origin first. |
| `click <selector>` | Playwright selector (`text=Foo`, `#id`, `button[aria-label=Ajouter]`, …) |
| `fill <selector> <text...>` | Fills an input |
| `press <key>` | e.g. `press Enter` |
| `wait-for <selector>` | Waits up to 15s for the selector to be visible |
| `text <selector>` | Prints `textContent` of the first match |
| `eval <js>` | `page.evaluate(js)`, prints the JSON result |
| `screenshot [name]` | Saves `SHOTS_DIR/<name>.png` |
| `console` | Dumps all captured console/page/network-failure log lines |
| `console-errors` | Same, filtered to errors/failures only — check this before declaring success |
| `quit` / `exit` | Closes the browser and exits |

For iterative debugging, run the driver under tmux and `send-keys` one
command at a time instead of piping a whole heredoc:

```bash
tmux new-session -d -s tips-driver -x 200 -y 50
tmux send-keys -t tips-driver 'node .claude/skills/run-tips/driver.mjs' Enter
tmux send-keys -t tips-driver 'launch http://localhost:5173' Enter
tmux capture-pane -t tips-driver -p
```

### 3. Stop

```bash
kill $(cat /tmp/tips-dev.pid)
```

## Auth bypass (why `seed-auth` works, and why it's safe)

This app is single-user and gates its whole UI behind Supabase email/password
auth (`src/components/Auth.jsx`) — see `App.jsx`: `if (!session) return
<Auth />`. There's no test account and no real Supabase project in this
container (`.env.local` points at `https://fake.supabase.co`), so signing in
for real is not an option here.

The app doesn't need it either: `useMissions.init()`
(`src/store/missions.js`) reads/writes only through Dexie/IndexedDB
(`src/lib/db.js`); the Supabase REST calls in `src/lib/sync.js`
(`flush`/`pullFromServer`/etc.) all check `error` and degrade to a
`pending`/`error` sync-status row rather than throwing — this repo's own
CLAUDE.md documents this offline-first design in detail. So once past the
`<Auth />` gate, the entire app (Accueil/Calendrier/Missions/Paie, the import
modal, the mission form) is fully explorable against local IndexedDB alone,
network failures and all — confirmed in this session: creating a mission
while "connected" to `fake.supabase.co` synced-status shows `1 en attente`
(never resolves, as expected) but the mission itself saves, appears in the
Missions list, and updates every Home-tab stat immediately.

Supabase-js's `getSession()` only checks that the persisted session object
has the right *shape* (`_isValidSession` in `@supabase/auth-js`) — it does
**not** verify the JWT signature client-side. So `seed-auth` writes a
syntactically-valid fake session straight into `localStorage` under the key
`supabase-js` computes for you: `sb-<project-ref>-auth-token`, where
`<project-ref>` is the first label of **`VITE_SUPABASE_URL`'s hostname**
(`fake` for `https://fake.supabase.co` — **not** `localhost`, which is the
page's own origin and was the first thing that tripped this up while
building the driver). `expires_at` is set far in the future so
`GoTrueClient` never attempts a background token refresh (which would hit
the fake host and fail). A `reload` after `seed-auth` is required — the
session is read once on mount (`App.jsx`'s `supabase.auth.getSession()`
effect), not reactively.

This bypass is local to the running browser tab's `localStorage`; nothing
about it is committed to app source or changes production behavior.

## Test

No test suite configured in this repo (per CLAUDE.md). `npm run build` is
the closest thing to a correctness gate beyond manual driving.

## Gotchas

- **`seed-auth`'s project ref is the *Supabase* hostname, not the page's.**
  The storage key `supabase-js` reads is derived from `VITE_SUPABASE_URL`
  (`fake.supabase.co` → `fake`), not `window.location.hostname`
  (`localhost`). Seeding `sb-localhost-auth-token` looks like it worked (no
  error) but silently leaves the app on the login screen after reload — the
  driver's `seed-auth` command already handles this correctly, but if
  `.env.local`'s `VITE_SUPABASE_URL` ever changes, pass the new ref
  explicitly: `seed-auth <new-ref>`.
- **`playwright` isn't a repo dependency.** Plain `import('playwright')` in
  `driver.mjs` fails with `ERR_MODULE_NOT_FOUND` unless it's installed
  somewhere Node's ESM resolver can see (this repo's `node_modules`, or an
  ancestor). The driver falls back to this container's global install via
  `createRequire`; see Prerequisites.
- **`readline`'s `line` event doesn't wait for your async handler.** An
  earlier version of `driver.mjs` fired `launch`, `wait-for`, `screenshot`
  etc. all essentially concurrently — `wait-for` ran before `page` even
  existed and failed silently mid-batch. Commands are now chained through an
  explicit promise queue (see the `queue = queue.then(...)` block at the
  bottom of `driver.mjs`) so each command only starts once the previous one
  resolves. If you extend the driver, keep new commands going through
  `HANDLERS`/the queue rather than firing Playwright calls directly from the
  `line` handler.
- **Google Fonts / Vercel Analytics requests always fail here** (no real
  outbound network to those hosts in this container) — `console-errors` will
  always show `ERR_CONNECTION_RESET` for `fonts.googleapis.com` and
  `ERR_TUNNEL_CONNECTION_FAILED` for `va.vercel-scripts.com` and
  `fake.supabase.co`. These are expected noise, not regressions — the app
  has no fallback font load path and doesn't need one to function. Look for
  *other* errors, not these three hosts.

## Troubleshooting

- **`EADDRINUSE` on `npm run dev`**: a previous dev server is still running.
  `kill $(cat /tmp/tips-dev.pid)` or `pkill -f "vite --port 5173"`.
- **`wait-for` times out on `text=Accueil` right after `seed-auth`**: you
  forgot the `reload` after `seed-auth`, or used the wrong project ref (see
  Gotchas above) — screenshot and check whether you're still on the
  `Connexion` screen.
- **`Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'playwright'`**: the
  global fallback path in `driver.mjs` (`/opt/node22/lib/node_modules`)
  doesn't exist on this machine. Run `npm install playwright` in the repo
  (or `cd .claude/skills/run-tips && npm init -y && npm install playwright`)
  — the plain `import('playwright')` path will then succeed and the fallback
  is never reached.
