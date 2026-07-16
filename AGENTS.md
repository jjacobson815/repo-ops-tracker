# AGENTS.md — AI Coding Agent Guide (repo-ops-tracker)

Concise entry point for AI coding agents working in this repo. 
For architecture / backend API / Docker / frontend docs, see [dev-docs/Index.md](dev-docs/Index.md).

## Current stack
- **Backend:** Node.js + Express (`server.js`) exposing a REST API.
- **Persistence:** **Prisma + SQLite** is the source of truth. Schema:
  [`prisma/schema.prisma`](prisma/schema.prisma); database file at `data/dev.db`
  (or under the active `DATA_DIR`).
- **Legacy JSON files are mirrors only.** `lib/db.js` writes `data/tasks.json`,
  `data/library.json`, etc. as side-effect copies. They are NOT the source of
  truth and must not be treated as authoritative.
- **Frontend:** native ES modules under `public/` (no bundler/framework).
- **Boards are plural.** The `Board` model
  ([`prisma/schema.prisma`](prisma/schema.prisma:10)) owns its own `lanes Lane[]`
  and `workflows WorkflowState[]` relations — each board has its own set of
  swimlanes and workflow states, scoped by `boardId` (not one global set). The
  manage-lanes UI lives in [`public/js/components/lanes.js`](public/js/components/lanes.js:1).

## Key runtime behaviors (lib/db.js)
- On boot, `lib/db.js` auto-runs `prisma migrate deploy` against the schema.
- `DATABASE_URL` is derived from `DATA_DIR` (`DATA_DIR` or `./data`). Under
  Docker, `DATA_DIR=/app/data`, so the DB lives at `/app/data/dev.db`.
- Some writes are mirrored to legacy JSON files via `writeLegacyJsonFile` for
  backward compatibility only (e.g. the `saveAll*` helpers and
  `saveTasksForBoard`). The JSON mirrors may lag the database and must not be
  treated as authoritative.

## How to verify behavior
- Verify against the **running app** and the SQLite database (`data/dev.db`),
  e.g. via `npx prisma studio` or `node test/api.test.js`.
- Do **not** treat `data/tasks.json` / `data/library.json` as authoritative —
  those are legacy mirrors and may lag the database.

## Useful scripts
- `npm run migrate:json` — import legacy JSON files (`boards.json`,
  `workflow.json`, `lanes.json`, `tasks.json`, `library.json`) into SQLite via
  [`scripts/migrate-json-to-sqlite.js`](scripts/migrate-json-to-sqlite.js).
- `npm start` — run the server (`node server.js`).

## Where to look first
- `lib/db.js` — DB abstraction, migration-on-boot, `DATA_DIR` handling.
- `server.js` — route wiring to the DB layer.
- `prisma/schema.prisma` — data models.
- `dev-docs/Index.md` — architecture, API, Docker, frontend docs.

## Known issues
- **KI-01 (RESOLVED)** — `POST /api/boards` (bulk board replace) previously ran
  `deleteMany()` + `createMany()` on `Board`; because `Lane` / `WorkflowState` /
  `Task` cascade-delete from `Board` ([`prisma/schema.prisma`](prisma/schema.prisma:28)),
  every board's lanes / workflow states / tasks were wiped on any board
  create/replace. Fixed by replacing the `deleteMany` + `createMany` pattern in
  `lib/db.js` with per-record `upsert`s plus a scoped delete-diff (delete only
  rows whose id is absent from the payload) across `saveAllBoards`, `saveAllTasks`,
  `saveAllWorkflows`, `saveAllLanes`, `saveAllLibraryEntries`, and the per-board
  variants. Resolved in commit `675e6bf` (verified by the KI-01 regression test
  added to `test/api.test.js`).

## Conventions
- `escapeHtml()` is duplicated locally in each frontend component that renders
  user-supplied data into `innerHTML` (`board.js`, `dashboard.js`, `workflow.js`,
  `app.js`, and `lanes.js`) rather than shared. New render code that interpolates
  user data into `innerHTML` should follow the same escape-before-render pattern
  (see the canonical implementation in
  [`public/js/components/lanes.js`](public/js/components/lanes.js:9)).
