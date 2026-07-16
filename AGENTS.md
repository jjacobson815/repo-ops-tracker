# AGENTS.md — AI Coding Agent Guide (repo-ops-tracker)

Concise entry point for AI coding agents working in this repo. For the full
upgrade handoff and current architecture specifics, read
[AGENT_HANDOFF.md](AGENT_HANDOFF.md). For architecture / backend API / Docker /
frontend docs, see [dev-docs/Index.md](dev-docs/Index.md).

## Current stack
- **Backend:** Node.js + Express (`server.js`) exposing a REST API.
- **Persistence:** **Prisma + SQLite** is the source of truth. Schema:
  [`prisma/schema.prisma`](prisma/schema.prisma); database file at `data/dev.db`
  (or under the active `DATA_DIR`).
- **Legacy JSON files are mirrors only.** `lib/db.js` writes `data/tasks.json`,
  `data/library.json`, etc. as side-effect copies. They are NOT the source of
  truth and must not be treated as authoritative.
- **Frontend:** native ES modules under `public/` (no bundler/framework).

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
- `node scripts/seed-board-data.js` — backfill default workflow states and a
  `general` lane into the legacy JSON files for any board that lacks them
  (JSON-side helper; does not write to SQLite directly).
- `npm start` — run the server (`node server.js`).

## Where to look first
- `lib/db.js` — DB abstraction, migration-on-boot, `DATA_DIR` handling.
- `server.js` — route wiring to the DB layer.
- `prisma/schema.prisma` — data models.
- `AGENT_HANDOFF.md` — detailed Prisma/SQLite upgrade handoff.
- `dev-docs/Index.md` — architecture, API, Docker, frontend docs.
