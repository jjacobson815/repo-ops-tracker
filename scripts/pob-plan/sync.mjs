#!/usr/bin/env node
// sync.mjs — one-shot: parse the PathOfBuilding Qt-port plan and push it into
// repo-ops-tracker two ways:
//
//   1. The dedicated Playwright profile (scripts/pob-plan/.profile/) — 17
//      boards, viewable via `npm run pob:view`. Not reachable from your
//      regular browser at all (separate browser profile/IndexedDB).
//   2. public/pob-plan-data/plan-bundles.json — a plain static file (no
//      browser needed to write it) that the app itself polls from
//      public/js/pob-plan-watch.js whenever you have it open in YOUR
//      browser, applying updates in place via public/js/pob-plan-apply.js.
//
// Both paths write the same board/workflow/lane/task rows with the same
// deterministic ids, so re-running (from either path) upserts in place
// instead of creating duplicates — see pob-plan-apply.js.
//
//   node scripts/pob-plan/sync.mjs
//   POB_PORT_PLAN_DIR=... node scripts/pob-plan/sync.mjs   # override source path

import { appendFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPobPlanBoard, buildPobPlanBoardsPerPhase } from './parse-plan.mjs';
import { syncBoardsToBrowser } from './sync-to-browser.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const DEFAULT_PLAN_DIR = 'C:/Users/User/source/repos/pob_workspace/PathOfBuilding/port-plan';
const PLAN_DIR = process.env.POB_PORT_PLAN_DIR || DEFAULT_PLAN_DIR;
const LOG_FILE = resolve(__dirname, 'sync.log');
const MANIFEST_PATH = resolve(REPO_ROOT, 'public', 'pob-plan-data', 'plan-bundles.json');

function log(line) {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  console.log(stamped);
  try { appendFileSync(LOG_FILE, stamped + '\n'); } catch { /* best-effort */ }
}

async function main() {
  log(`reading plan from ${PLAN_DIR}`);
  const combined = buildPobPlanBoard(PLAN_DIR);
  const perPhase = buildPobPlanBoardsPerPhase(PLAN_DIR);
  log(`parsed: ${combined.lanes.length} phases, ${combined.tasks.length} cards combined `
    + `(active phase ${combined.activePhase}, ${combined.decisionCount} open decisions); `
    + `${perPhase.length} per-phase boards, ${perPhase.reduce((n, p) => n + p.tasks.length, 0)} cards total`);

  const bundles = [combined, ...perPhase];

  // 1. Static manifest for the app's own auto-poll (public/js/pob-plan-watch.js)
  // — plain fs write, no browser involved.
  const generatedAt = new Date().toISOString();
  mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify({ generatedAt, boards: bundles }, null, 2), 'utf8');
  log(`wrote manifest: ${MANIFEST_PATH}`);

  // 2. Dedicated Playwright profile (unaffected by whether anyone's browser
  // is open or polling the manifest).
  const results = await syncBoardsToBrowser(bundles, { headless: true });
  const [combinedResult, ...perPhaseResults] = results;
  log(`synced combined board: ${combinedResult.boardCreated ? 'created' : 'updated'}, `
    + `${combinedResult.laneCount} lanes, ${combinedResult.workflowCount} columns, `
    + `${combinedResult.taskCount} cards (${combinedResult.doneCount} done)`);
  perPhaseResults.forEach((r, i) => {
    log(`synced phase ${perPhase[i].phaseNum}: ${r.boardCreated ? 'created' : 'updated'}, `
      + `${r.laneCount} lanes, ${r.taskCount} cards (${r.doneCount} done)`);
  });
}

main().catch((err) => {
  log(`ERROR: ${err.stack || err.message || err}`);
  process.exitCode = 1;
});
