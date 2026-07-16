# Agent Handoff — Prisma/SQLite Upgrade for repo-ops-tracker

## Current status
The repository has been upgraded from JSON file persistence to a Prisma + SQLite-backed persistence layer, while preserving the existing Express API contract and frontend behavior as closely as possible.

## What changed
- Added Prisma dependencies and initialized a SQLite schema in Prisma.
- Added a database abstraction layer in [lib/db.js](lib/db.js) that exposes CRUD-style helpers for:
  - tasks
  - boards
  - workflow states
  - lanes
  - library entries
- Reworked [server.js](server.js) to use the Prisma-backed DB layer for the existing REST routes.
- Added a migration helper at [scripts/migrate-json-to-sqlite.js](scripts/migrate-json-to-sqlite.js) to import legacy JSON data into SQLite.
- Added the Prisma schema at [prisma/schema.prisma](prisma/schema.prisma).
- Added [scripts/seed-board-data.js](scripts/seed-board-data.js) to backfill default workflow states and a `general` lane into the legacy JSON files for any board that lacks them.
- Updated [package.json](package.json), [Dockerfile](Dockerfile), [README.md](README.md), and [dev-docs/Docker & Persistence.md](dev-docs/Docker%20&%20Persistence.md) to reflect the new stack.
- Updated the API smoke test at [test/api.test.js](test/api.test.js) to expect a SQLite database file in the data directory.

## Important implementation details
- The SQLite database file is stored at [data/dev.db](data/dev.db) (or under the active DATA_DIR path when overridden).
- Prisma is configured to use the active database URL from the environment via the schema.
- The app still uses the same Express routes and JSON response shapes expected by the frontend.
- For compatibility, the new DB layer also writes the legacy JSON files under the data directory so the old file-based artifacts are still present.

## Known verification state
The implementation is verified by running:

```bash
node test/api.test.js
```

The test spawns `node server.js` against a temporary `DATA_DIR` (`.test-data/`)
and asserts both API responses and on-disk persistence (the SQLite `dev.db` plus
the legacy JSON mirrors). The earlier path-handling issues around the temporary
test-data directory and the database file location have since been addressed in
[lib/db.js](lib/db.js) by resolving `DATABASE_URL` to an absolute `file:` URL
derived from `DATA_DIR`. Re-run the test to confirm a fully green state before
considering the upgrade complete.

## Files to inspect first
- [lib/db.js](lib/db.js) — main database abstraction and initialization logic
- [server.js](server.js) — route wiring to the DB layer
- [prisma/schema.prisma](prisma/schema.prisma) — database model definitions
- [test/api.test.js](test/api.test.js) — end-to-end verification expectations

## Suggested next steps
1. Finish aligning the runtime DB location with the temporary data directory used by the smoke test.
2. Confirm the Prisma migration path works reliably when the app starts with a fresh DATA_DIR.
3. Remove any unnecessary legacy JSON mirroring if the team wants SQLite to be the sole source of truth.
4. Optionally add stronger transaction handling or more explicit schema validation for board/task relationships.

## Commands to use
```bash
npm install
npx prisma generate
# The app auto-runs `prisma migrate deploy` on boot, so this is usually unnecessary:
npx prisma migrate deploy --schema prisma/schema.prisma
npm run migrate:json   # import legacy JSON files into SQLite
npm start              # run the server (node server.js)
node test/api.test.js
```

## Notes
- The app is currently in a partially verified state: major persistence migration work is complete, but the last test issues should be resolved before finalizing.
- If another agent continues, they should focus on the database initialization path and the test environment path handling first.
