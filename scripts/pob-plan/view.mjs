#!/usr/bin/env node
// view.mjs — opens the SAME persistent browser profile sync.mjs writes into,
// visibly, so you can actually look at the "PoB → Qt Port Plan" board.
// (The synced data lives in that profile's IndexedDB — a normal desktop
// Chrome/Edge window is a different profile and won't see it. This is a
// consequence of repo-ops-tracker being a client-side/IndexedDB app with no
// server-side database — see MIGRATION-NOTES.md.)
//
//   node scripts/pob-plan/view.mjs
//
// Leaves the window open; close it yourself when done. Do not run this at the
// same time as sync.mjs against the same profile (Chromium profiles don't
// like concurrent writers) — the scheduled sync is quick (a few seconds every
// 30 min), so just avoid the rare overlap.

// '@playwright/test' is imported dynamically below, AFTER
// PLAYWRIGHT_BROWSERS_PATH is set — see sync-to-browser.mjs for why a static
// import up here would be too late (ES module import hoisting).
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const PORT = Number(process.env.POB_SYNC_PORT || 8799);
const PROFILE_DIR = resolve(__dirname, '.profile');
// Repo-local, not %LOCALAPPDATA% — see sync-to-browser.mjs for why.
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(__dirname, '.browsers');
const { chromium } = await import('@playwright/test');

function waitForServer(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolvePromise, reject) => {
    const tryOnce = () => {
      const req = http.get(`http://localhost:${port}/`, (res) => { res.resume(); resolvePromise(); });
      req.on('error', () => {
        if (Date.now() > deadline) reject(new Error(`static server on :${port} did not start in time`));
        else setTimeout(tryOnce, 200);
      });
    };
    tryOnce();
  });
}

const child = spawn(process.execPath, ['scripts/serve.mjs'], {
  cwd: REPO_ROOT,
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'inherit'
});
process.on('SIGINT', () => { child.kill(); process.exit(0); });

await waitForServer(PORT);
const context = await chromium.launchPersistentContext(PROFILE_DIR, { headless: false });
const page = context.pages()[0] || (await context.newPage());
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
console.log(`Opened http://localhost:${PORT}/ — pick "PoB → Qt Port Plan" from the board selector.`);
console.log('Close the browser window to exit (this process stays alive until you do).');
context.on('close', () => { child.kill(); process.exit(0); });
