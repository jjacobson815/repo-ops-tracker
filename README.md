# repo-ops-tracker

Personal kanban board + dashboard + AI-agent instruction library for tracking
repo clones, agent-generated docs, and build/code-touch work across multiple repos.

## Architecture

A small **Express** backend (`server.js`) serves a single-page frontend built from
native **ES modules** under `public/` (no bundler, no build step, no framework).
Two Google Fonts (IBM Plex Mono, Inter) are the only external calls. App data is
now persisted in SQLite via Prisma, with the database file stored at
`data/dev.db` and the JSON files left as legacy import sources. See
[`dev-docs/Index.md`](dev-docs/Index.md) for the full design, API reference, and
Docker/persistence details.

## Run it

**Option A — Node (local)**
```bash
npm install
node server.js
```
Then visit `http://localhost:8787`. (`npm install` is required — dependencies
are `express` and `@prisma/client`, with `prisma` as a dev dependency.)

**Option B — Docker**
```bash
docker compose up --build
```
Then visit `http://localhost:8787`.

> Note: the Docker image copies the app source at build time. The compose
> service only mounts `./data` into the container, not the code directory.
> That means code changes in this repo require rebuilding the image via
> `docker compose up --build` before restarting the container.

The host `./data` directory is bind-mounted into the container, so your data survives rebuilds.

## Data

Everything is now saved to SQLite via Prisma (`data/dev.db`), while the existing
JSON files under `data/` remain available for migration/import workflows. In
Docker, the database file lives in the host `./data` directory, so it survives
rebuilds and can be backed up or inspected directly. The library is seeded with
three default prompts on first run when the database is empty. A default board,
workflow, and lane are also seeded at that time.

To import existing legacy JSON data into SQLite, run `npm run migrate:json`
(which invokes [`scripts/migrate-json-to-sqlite.js`](scripts/migrate-json-to-sqlite.js)).

## Files
- `server.js` — Express backend + Prisma/SQLite persistence + REST API
- `lib/db.js` — Prisma database access helpers
- `prisma/schema.prisma` — SQLite schema definition
- `scripts/migrate-json-to-sqlite.js` — import legacy JSON data into SQLite
- `scripts/seed-board-data.js` — backfill default workflow/lanes into legacy JSON for boards lacking them
- `prisma/migrations/` — applied SQLite migrations (run automatically on boot)
- `public/` — the frontend (ES modules, CSS, `index.html` skeleton)
- `data/` — SQLite database (`dev.db`) plus legacy JSON stores
- `AGENT_HANDOFF.md` — instructions for AI coding agents working on this codebase
- `dev-docs/` — detailed developer documentation (architecture, API, Docker)
- `README.md` — this file
