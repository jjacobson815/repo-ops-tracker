# repo-ops-tracker

Personal kanban board + dashboard + AI-agent instruction library for tracking
repo clones, agent-generated docs, and build/code-touch work across multiple repos.

## Architecture

A fully **client-side** single-page app built from native **ES modules** under
`public/` (no bundler, no build step, no framework). Two Google Fonts (IBM Plex
Mono, Inter) are the only external calls. All data is persisted in the browser
via **IndexedDB** (through the vendored [Dexie](public/js/vendor/dexie.mjs)
library) — there is no backend and no network calls for app data. This is
Phase 1 of an Android/Capacitor port; see [`RECON.md`](RECON.md) and
[`MIGRATION-NOTES.md`](MIGRATION-NOTES.md) for the migration off the previous
Express/Prisma/SQLite server (preserved for reference under
[`legacy-server/`](legacy-server/)).

## Run it

```bash
npm install
npm start
```
Then visit `http://localhost:8787`. `npm start` runs
[`scripts/serve.mjs`](scripts/serve.mjs), a zero-dependency static file
server for `public/`. Any static file host works identically — there's no
server-side logic to run.

## Tests

```bash
npm test
```
Runs the Playwright acceptance suite ([`test/e2e.spec.mjs`](test/e2e.spec.mjs))
against the real static app in headless Chromium (real IndexedDB, real ES
module loading).

## Data

Everything is saved to **IndexedDB** in the browser (database name
`repo-ops-tracker`) — inspect it via DevTools → Application → IndexedDB. The
library is seeded with three default prompts on first load when the database
is empty; a default board, workflow, and lane are seeded at that time too.
Because storage is per-browser-profile, data does not sync across devices or
browsers in this phase (see MIGRATION-NOTES.md's follow-ups).

**Import/export** — the Manage Boards view can export any board to a portable
JSON bundle (workflow, lanes, tasks, and any linked instructions) and import a
bundle back in as a new board. This is also how you back up or move data
between browser profiles/devices in the absence of sync.

**Migrating from an old server install** — if you have a legacy
`data/dev.db` from before this migration, run
`npm run migrate:export-bundle` (see [`scripts/export-sqlite-to-bundle.mjs`](scripts/export-sqlite-to-bundle.mjs))
to emit one import bundle per board, then import each through the app's
manage-boards "import" button.

## AI board generation

Not available in this client-only build. Generating a board draft requires a
server-side `OPENAI_API_KEY`, and there is no server to hold that secret —
see [`MIGRATION-NOTES.md`](MIGRATION-NOTES.md) for details. The Manage Boards
dialog surfaces a clear message when this is attempted; manual board creation
and JSON import/export are unaffected.

## Files
- `public/` — the frontend (ES modules, CSS, `index.html` skeleton)
  - `public/js/db.js` — Dexie (IndexedDB) schema
  - `public/js/store.js` — data-access layer (CRUD, validation, transactions)
  - `public/js/app.js` — app state + `ctx` wrappers consumed by components
  - `public/js/vendor/dexie.mjs` — vendored Dexie library
- `scripts/serve.mjs` — zero-dependency static file server (`npm start`)
- `scripts/export-sqlite-to-bundle.mjs` — one-shot legacy SQLite → import
  bundle migration helper
- `legacy-server/` — the retired Express/Prisma/SQLite server, kept for
  reference and for the migration script above (not run by `npm start`)
- `test/e2e.spec.mjs` / `playwright.config.mjs` — Playwright acceptance suite
- `RECON.md` — ground-truth model/route inventory for the Dexie migration
- `MIGRATION-NOTES.md` — migration mapping, deviations, acceptance results
- `AGENTS.md` — instructions for AI coding agents working on this codebase
- `README.md` — this file
