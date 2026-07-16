#!/usr/bin/env node
// Minimal chromium-cli-style REPL driver for this app, built because no
// chromium-cli binary is available in this container. Reads line-delimited
// commands from stdin (pipe a heredoc, or drive interactively under tmux).
//
// Usage:
//   node driver.mjs <<'EOF'
//   launch http://localhost:5173
//   seed-auth
//   reload
//   wait-for text=Accueil
//   screenshot home
//   EOF
//
// Screenshots land in SHOTS_DIR (default /tmp/tips-shots).

import fs from 'node:fs'
import readline from 'node:readline'
import { chromium } from 'playwright'

const SHOTS_DIR = process.env.SHOTS_DIR || '/tmp/tips-shots'
fs.mkdirSync(SHOTS_DIR, { recursive: true })
const NAV = { waitUntil: 'domcontentloaded' }

let browser, context, page
const logs = []

function trackPage(p) {
  p.on('console', msg => logs.push(`[console:${msg.type()}] ${msg.text()}`))
  p.on('pageerror', err => logs.push(`[pageerror] ${err.message}`))
  p.on('requestfailed', req => logs.push(`[requestfailed] ${req.url()} ${req.failure()?.errorText || ''}`))
}

async function cmd_launch(url) {
  if (browser) await browser.close() // relaunching without closing the old one would orphan it
  browser = await chromium.launch({ args: ['--no-sandbox'] })
  context = await browser.newContext({ viewport: { width: 420, height: 900 } })
  page = await context.newPage()
  trackPage(page)
  if (url) await page.goto(url, NAV)
  console.log('ok launched' + (url ? ` at ${url}` : ''))
}

// Seeds a fake-but-well-formed Supabase session directly into localStorage so
// the app treats us as logged in without a real Supabase backend. See
// SKILL.md "Auth bypass" for why this is safe (session shape isn't
// cryptographically verified client-side — only read back by getSession()).
//
// IMPORTANT: the storage key is derived from VITE_SUPABASE_URL's hostname
// (the *configured Supabase project*, e.g. "fake" from
// https://fake.supabase.co in .env.local) — NOT from the page's own
// location.hostname ("localhost"). Pass the project ref as an argument if
// .env.local ever changes; defaults to this repo's current value.
async function cmd_seedAuth(projectRef = 'fake') {
  const key = `sb-${projectRef}-auth-token`
  const fakeSession = {
    access_token: 'fake-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 9999999999, // year 2286 — never looks expired, so no refresh network call fires
    refresh_token: 'fake-refresh-token',
    user: {
      id: '00000000-0000-0000-0000-000000000000',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'dev@local.test',
      app_metadata: {}, user_metadata: {}, identities: [],
      created_at: new Date().toISOString()
    }
  }
  await page.evaluate(({ key, session }) => {
    localStorage.setItem(key, JSON.stringify(session))
  }, { key, session: fakeSession })
  console.log(`ok seeded ${key}`)
}

async function cmd_goto(url) { await page.goto(url, NAV); console.log('ok goto ' + url) }
async function cmd_reload() { await page.reload(NAV); console.log('ok reload') }
async function cmd_click(sel) { await page.click(sel, { timeout: 10000 }); console.log('ok click ' + sel) }
async function cmd_fill(sel, ...rest) { await page.fill(sel, rest.join(' '), { timeout: 10000 }); console.log('ok fill ' + sel) }
async function cmd_press(key) { await page.keyboard.press(key); console.log('ok press ' + key) }
async function cmd_waitFor(sel) { await page.waitForSelector(sel, { timeout: 15000 }); console.log('ok wait-for ' + sel) }
async function cmd_text(sel) { console.log(await page.textContent(sel)) }
async function cmd_eval(...jsParts) {
  const js = jsParts.join(' ')
  const result = await page.evaluate(js)
  console.log(JSON.stringify(result))
}
async function cmd_screenshot(name = `shot-${Date.now()}`) {
  const path = `${SHOTS_DIR}/${name}.png`
  await page.screenshot({ path })
  console.log('ok screenshot ' + path)
}
async function cmd_console() {
  console.log(logs.length ? logs.join('\n') : '(no console/page errors captured)')
}
async function cmd_consoleErrors() {
  const errs = logs.filter(l => l.startsWith('[console:error]') || l.startsWith('[pageerror]') || l.startsWith('[requestfailed]'))
  console.log(errs.length ? errs.join('\n') : '(none)')
}
async function cmd_quit() {
  if (browser) await browser.close()
  console.log('ok bye')
  process.exit(0)
}

const HANDLERS = {
  launch: cmd_launch, goto: cmd_goto, reload: cmd_reload,
  'seed-auth': cmd_seedAuth,
  click: cmd_click, fill: cmd_fill, press: cmd_press,
  'wait-for': cmd_waitFor, text: cmd_text, eval: cmd_eval,
  screenshot: cmd_screenshot, console: cmd_console,
  'console-errors': cmd_consoleErrors,
  quit: cmd_quit, exit: cmd_quit,
}

// `for await` over the async-iterable readline interface awaits each line's
// handler before pulling the next line, so commands run strictly one-at-a-
// time (needed: `wait-for` right after `launch` must not start before
// `launch` has set `page`) with no extra queue bookkeeping.
const rl = readline.createInterface({ input: process.stdin, terminal: false })
for await (const line of rl) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const [name, ...args] = trimmed.split(/\s+/)
  const handler = HANDLERS[name]
  if (!handler) { console.log('error unknown command: ' + name); continue }
  try {
    await handler(...args)
  } catch (err) {
    console.log('error ' + err.message)
  }
}
if (browser) await browser.close()
