# PoB → Qt Port Plan sync

Mirrors the newest planning docs from the PathOfBuilding Qt-port
(`C:\Users\User\source\repos\pob_workspace\PathOfBuilding\port-plan\`) into a
repo-ops-tracker kanban board called **"PoB → Qt Port Plan"**.

## Source of truth

`port-plan/STATUS.md` (active phase, open decisions) + `port-plan/phases/PHASE-*.md`
(16 phases, checklist items). `PathOfBuilding-legacy/port-plan/` is a **stale**
copy of the same folder — confirmed by diff (it's missing the latest Phase 0.1
completion note) — so it is deliberately NOT read.

## Board shape

- **Lanes** (rows) = the 16 phases (`Phase 0` … `Phase 15`).
- **Columns** = `backlog` / `active phase` / `open decision` / `done`.
  - `done` = checklist items checked `[x]` in the phase file.
  - `active phase` = unchecked items in whichever phase `STATUS.md` names as
    the current ACTIVE PHASE.
  - `backlog` = unchecked items in every other phase.
  - `open decision` = the "❓ Open decisions" bullets in `STATUS.md`, placed in
    the lane of the phase they gate.
- Card title = the checklist item's sentence (size marker `(S)/(M)/(L)` moved
  to a tag); card notes = the full item text including any `→` follow-up note.
  Tags: `phase-N`, `part-X.Y`, `size-s|m|l`, and `decision` for open-decision
  cards.

This board is a **read-only mirror** — every sync fully regenerates it from
the plan docs. Task/lane/column ids are deterministic (`p0-i3`, `phase-4`,
`decision-2`, ...), so re-running upserts the same rows in place (via
`store.js`'s existing upsert+delete-diff functions) instead of creating
duplicate boards. Manual edits made directly on this board in the app will be
overwritten on the next sync.

## JSON import (one board per phase)

`export-bundle.mjs` writes the same plan as a **separate schemaVersion:2
import bundle per phase** — 16 files, one per `PHASE-N-*.md` — for importing
into your own regular browser through the app's UI (manage boards → Import).
This is a different shape than the mirrored board above:

- **Board** = one phase (`PoB Qt Port — Phase N: <title>`).
- **Lanes** = that phase's `## Part X.Y` sections, plus an "Open decisions"
  lane if that phase has any gating decisions in `STATUS.md`.
- **Columns** = same four as the mirror (`backlog` / `active phase` /
  `open decision` / `done`).

```bash
node scripts/pob-plan/export-bundle.mjs [output-dir]   # defaults to ./pob-qt-port-plan-by-phase
```

Import each file separately (manage boards → Import → pick a file — there's
no bulk-import in the UI). Unlike the mirrored sync above, importing through
the UI always mints a **new** board with fresh ids — re-running the export
and re-importing after the plan changes creates duplicates rather than
updating the originals; delete the old "PoB Qt Port — Phase N: ..." boards
first if you want to replace them.

## Why this needs a browser at all

repo-ops-tracker has no server-side database anymore (see
`../../MIGRATION-NOTES.md`) — everything lives in the browser's IndexedDB via
Dexie. There is no Node-side way to write to it, so `sync-to-browser.mjs`
drives a real (headless) Chromium via Playwright and calls `public/js/store.js`
functions directly in-page.

That Chromium instance uses a **dedicated persistent profile**
(`scripts/pob-plan/.profile/`, gitignored) — a separate browser identity from
your everyday Chrome/Edge. A normal browser window will NOT show these
boards; you have to look at them through that same profile. Run:

```bash
npm run pob:view
```

This opens a visible window on that profile and serves the app on
`http://localhost:8799`. Pick a board from the selector. Leave `pob:sync` and
`pob:view` from running at the same time against the profile (sync only
takes a couple seconds, so this is rarely an issue).

## Running a sync by hand

```bash
npm run pob:sync
```

Writes/updates **17 boards** in that dedicated profile, all upserted in
place on every run (same idempotent-by-deterministic-id trick, scoped per
board so a lane/column/task id collision between boards can't happen — see
the id-prefixing note in `parse-plan.mjs`):

- `PoB → Qt Port Plan` — the single combined board, 16 phase lanes
- `PoB Qt Port — Phase 0: ...` … `Phase 15: ...` — one board per phase, lanes
  = that phase's own `## Part X.Y` sections

Logs to `scripts/pob-plan/sync.log`. Override the source path with
`POB_PORT_PLAN_DIR` if the PathOfBuilding repo ever moves.

## Recurring sync (every 30 minutes)

A Windows Scheduled Task (`RepoOpsTracker-PoBPlanSync`) runs
`scripts/pob-plan/run-sync.cmd` (which calls `node.exe sync.mjs`) every 30
minutes, indefinitely, only while you're logged on — no stored credentials.
Created with:

```bash
schtasks /create /tn "RepoOpsTracker-PoBPlanSync" /tr "C:\Users\User\source\repos\repo_tracker_copy\repo-ops-tracker\scripts\pob-plan\run-sync.cmd" /sc minute /mo 30 /st 00:00
```

Check on it:

```bash
schtasks /query /tn "RepoOpsTracker-PoBPlanSync" /v /fo list
```

Remove it:

```bash
schtasks /delete /tn "RepoOpsTracker-PoBPlanSync" /f
```

## Auto-updating boards in YOUR regular browser

Everything above updates a *separate* dedicated Chromium profile — not
reachable from your everyday Chrome/Edge, because this app's data is
per-browser-profile IndexedDB with no server (see "Why this needs a browser
at all"). Driving your real browser via Playwright isn't a good option either
— Chrome locks its profile directory while running, so an automated
background task would either fail outright or fight your live session.

Instead, the app itself can pull updates from inside a tab you already have
open:

- `sync.mjs` also writes `public/pob-plan-data/plan-bundles.json` — a plain
  static file, no browser needed to produce it, served by whatever is serving
  `public/` (including your regular `npm start`/`npm run serve` instance).
- `public/js/pob-plan-watch.js` polls that file and applies updates via
  `public/js/pob-plan-apply.js` (the same apply logic
  `sync-to-browser.mjs` uses — see the code comment there — so the two paths
  can't drift apart).
- **manage boards → "sync PoB plan now"** triggers it on demand. The first
  successful click also flips on a **background auto-poll** (checks every 5
  min while the tab is open) for that browser going forward.

Auto-poll is **opt-in, off by default**, persisted per-browser in
`localStorage['pobPlanAutoPollEnabled']`. It's not on by default because this
is a generic personal kanban app — nothing else about it should assume you're
using the PathOfBuilding integration, and unconditionally auto-injecting 17
PoB boards into every fresh session (including e2e test runs — this is
exactly what broke `npm test` once already) would be a bad default for anyone
who hasn't opted in.

Board matching is by id first, then by **title** — so if you already
hand-imported one of these boards via the schemaVersion:2 JSON path earlier,
the first sync *adopts* it (reuses its id, replaces its content) instead of
creating a duplicate. From that point on it's a live mirror like everything
else here: manual edits get overwritten on the next sync.

### Why Playwright's browsers live in `scripts/pob-plan/.browsers/`, not the default cache

Playwright normally installs Chromium under `%LOCALAPPDATA%\ms-playwright`.
That worked fine for interactive testing but the Scheduled Task kept failing
with `Executable doesn't exist` for a file that provably *was* on disk. Root
cause: `%LOCALAPPDATA%` was being transparently redirected by Windows
AppContainer virtualization (this repo was set up via a packaged/sandboxed
app), so the browser was only ever visible to processes inside that same
package — a genuinely independent process like a real Scheduled Task saw a
different, empty `%LOCALAPPDATA%\ms-playwright`.

Fix: browsers are installed inside the repo tree instead (not subject to that
redirection), and both `sync-to-browser.mjs` and `view.mjs` set
`PLAYWRIGHT_BROWSERS_PATH` explicitly *before* dynamically importing
`@playwright/test` (a static top-of-file import would resolve the default
path too early, before the override could take effect). If you ever need to
reinstall:

```bash
PLAYWRIGHT_BROWSERS_PATH="<repo>/scripts/pob-plan/.browsers" npx playwright install chromium
```
