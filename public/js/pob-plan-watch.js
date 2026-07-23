// pob-plan-watch.js — makes the PoB → Qt Port plan boards update automatically
// in THIS browser tab (not just the separate Playwright profile
// scripts/pob-plan/sync.mjs also maintains — that profile isn't reachable
// from your everyday browser at all; see scripts/pob-plan/README.md).
//
// Polls a plain static JSON file — public/pob-plan-data/plan-bundles.json —
// which scripts/pob-plan/sync.mjs rewrites every 30 minutes via a Windows
// Scheduled Task (no browser needed for that write, it's a plain fs write).
// If that file was never generated (scheduled task not set up, or you don't
// use this feature), fetch() 404s and every function here just no-ops —
// nothing about this file assumes the PoB integration is in use.

import { applyPobPlanBoard } from './pob-plan-apply.js';

const MANIFEST_URL = '/pob-plan-data/plan-bundles.json';
const POLL_MS = 5 * 60 * 1000; // 5 min — the manifest itself only changes every 30 min
const LAST_APPLIED_KEY = 'pobPlanLastAppliedAt';
const AUTO_POLL_ENABLED_KEY = 'pobPlanAutoPollEnabled';

let pollHandle = null;

// Auto-poll is OPT-IN, persisted in localStorage, off by default. Without
// this gate, EVERY fresh session of this generic kanban app would silently
// pull in PoB-specific boards the instant the manifest file exists on disk —
// wrong default for anyone not using this integration (this is exactly what
// broke the app's own e2e suite: a fresh test context expects a fresh board
// list, not 16 boards injected from a leftover manifest file). Call
// markPobPlanAutoPollEnabled() once, from the manual "sync now" action, to
// turn this on going forward.
export function isPobPlanAutoPollEnabled() {
  return localStorage.getItem(AUTO_POLL_ENABLED_KEY) === '1';
}

export function markPobPlanAutoPollEnabled() {
  localStorage.setItem(AUTO_POLL_ENABLED_KEY, '1');
}

async function fetchManifest() {
  let res;
  try {
    res = await fetch(MANIFEST_URL, { cache: 'no-store' });
  } catch {
    return null; // offline / server not serving pob-plan-data at all
  }
  if (!res.ok) return null;
  try { return await res.json(); } catch { return null; }
}

// force:true (manual button) always re-applies, even if nothing changed —
// cheap (store.js's upsert+delete-diff is idempotent) and gives immediate
// feedback. force:false (background poll) skips work when the manifest's
// generatedAt hasn't moved since the last apply.
export async function syncPobPlanNow({ force = true } = {}) {
  const manifest = await fetchManifest();
  if (!manifest || !Array.isArray(manifest.boards)) {
    return { ok: false, reason: 'no plan manifest found — scheduled sync may not be set up on this machine' };
  }
  if (!force && localStorage.getItem(LAST_APPLIED_KEY) === manifest.generatedAt) {
    return { ok: true, skipped: true, generatedAt: manifest.generatedAt };
  }

  const results = [];
  for (const bundle of manifest.boards) {
    results.push(await applyPobPlanBoard(bundle));
  }
  localStorage.setItem(LAST_APPLIED_KEY, manifest.generatedAt);
  return {
    ok: true,
    skipped: false,
    generatedAt: manifest.generatedAt,
    boardCount: results.length,
    taskCount: results.reduce((n, r) => n + r.taskCount, 0)
  };
}

// onApplied(result) fires after a background sync actually wrote something
// (not on every poll tick — most ticks find nothing changed and skip). Use it
// to refresh the visible UI (board selector, current board's cards) since
// this module deliberately doesn't import app.js itself (would create an
// import cycle — app.js already imports this module).
export function startPobPlanAutoPoll(onApplied) {
  if (pollHandle) return;
  const tick = () => {
    syncPobPlanNow({ force: false })
      .then((result) => { if (result.ok && !result.skipped && onApplied) onApplied(result); })
      .catch(() => { /* best-effort */ });
  };
  tick();
  pollHandle = setInterval(tick, POLL_MS);
}

export function stopPobPlanAutoPoll() {
  if (pollHandle) { clearInterval(pollHandle); pollHandle = null; }
}
