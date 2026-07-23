// sync-to-browser.mjs — pushes a parsed plan board into repo-ops-tracker's
// IndexedDB by driving a real Chromium instance (Dexie only exists in-browser,
// there's no Node-side IndexedDB in this app since the Express/Prisma server
// was removed — see MIGRATION-NOTES.md). Uses a PERSISTENT Playwright profile
// so the data survives between runs and `view.mjs` can reopen the same profile
// to actually look at the board.
//
// All writes go through public/js/pob-plan-apply.js, which itself goes
// through public/js/store.js's existing upsert+delete-diff functions (same
// discipline the app itself uses — see KI-01 notes in store.js) with
// deterministic ids from parse-plan.mjs, so re-running this updates the SAME
// board in place instead of creating duplicates.

// NOTE: '@playwright/test' is imported dynamically inside syncBoardToBrowser,
// not statically here. ES module static imports are fully evaluated before
// ANY of this file's own top-level code runs (import hoisting) — so a static
// import up here would resolve Playwright's default browsers path before the
// PLAYWRIGHT_BROWSERS_PATH override below ever takes effect. Learned the hard
// way: it silently fell back to the (redirected, Task-Scheduler-invisible)
// default path with no error, since a %LOCALAPPDATA% install existed there
// too — see the comment below.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const PORT = Number(process.env.POB_SYNC_PORT || 8799);
const PROFILE_DIR = resolve(__dirname, '.profile');

// Browsers live inside the repo tree, NOT under %LOCALAPPDATA% (Playwright's
// normal default install location). %LOCALAPPDATA% gets transparently
// redirected by Windows AppContainer virtualization for processes spawned
// from a packaged app, so a browser installed there is invisible to a
// genuinely independent process like a real Windows Scheduled Task — it was
// only ever visible to tools running inside that same packaged app's process
// tree. Setting this explicitly (and installing via
// `PLAYWRIGHT_BROWSERS_PATH=<this dir> npx playwright install chromium`)
// avoids that redirection entirely.
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(__dirname, '.browsers');

function waitForServer(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolvePromise, reject) => {
    const tryOnce = () => {
      const req = http.get(`http://localhost:${port}/`, (res) => {
        res.resume();
        resolvePromise();
      });
      req.on('error', () => {
        if (Date.now() > deadline) reject(new Error(`static server on :${port} did not start in time`));
        else setTimeout(tryOnce, 200);
      });
    };
    tryOnce();
  });
}

async function withStaticServer(fn) {
  const child = spawn(process.execPath, ['scripts/serve.mjs'], {
    cwd: REPO_ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore'
  });
  try {
    await waitForServer(PORT);
    return await fn();
  } finally {
    child.kill();
  }
}

// Runs entirely inside the page. Keep this a plain function (no closures over
// outer scope) since Playwright serializes it to run in-browser. Delegates to
// the SAME public/js/pob-plan-apply.js the app's own pob-plan-watch.js uses,
// so the Playwright-driven path and the in-app auto-poll path can never drift
// apart.
async function applyBoardInPage(bundle) {
  const { applyPobPlanBoard } = await import('/js/pob-plan-apply.js');
  return applyPobPlanBoard(bundle);
}

export async function syncBoardToBrowser(planBundle, { headless = true } = {}) {
  const [result] = await syncBoardsToBrowser([planBundle], { headless });
  return result;
}

// Same as syncBoardToBrowser but for N board bundles in ONE browser
// session/page (avoids relaunching Chromium + the static server per board —
// with 17 boards that matters). Each bundle is applied with its own
// page.evaluate call, sequentially, so a later bundle's getAllBoards() sees
// every board an earlier bundle in this same run already wrote (required for
// saveAllBoards' KI-01 cascade-delete safety — see applyBoardInPage).
export async function syncBoardsToBrowser(planBundles, { headless = true } = {}) {
  const { chromium } = await import('@playwright/test');
  return withStaticServer(async () => {
    const context = await chromium.launchPersistentContext(PROFILE_DIR, { headless });
    try {
      const page = context.pages()[0] || (await context.newPage());
      await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
      const results = [];
      for (const bundle of planBundles) {
        results.push(await page.evaluate(applyBoardInPage, bundle));
      }
      return results;
    } finally {
      await context.close();
    }
  });
}

export const SYNC_PORT = PORT;
export const PROFILE_DIRECTORY = PROFILE_DIR;
