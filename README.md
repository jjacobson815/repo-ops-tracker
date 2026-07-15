# repo-ops-tracker

Personal kanban board + dashboard + AI-agent instruction library for tracking
repo clones, agent-generated docs, and build/code-touch work across multiple repos.

## Architecture

A small **Express** backend (`server.js`) serves a single-page frontend built from
native **ES modules** under `public/` (no bundler, no build step, no framework).
Two Google Fonts (IBM Plex Mono, Inter) are the only external calls. App data is
persisted to JSON files on the server — `data/tasks.json` and `data/library.json`
— not to browser `localStorage`. See [`dev-docs/Index.md`](dev-docs/Index.md) for
the full design, API reference, and Docker/persistence details.

## Run it

**Option A — Node (local)**
```bash
npm install
node server.js
```
Then visit `http://localhost:8787`. (`npm install` is required — the only
dependency is `express`.)

**Option B — Docker**
```bash
docker compose up --build
```
Then visit `http://localhost:8787`. The host `./data` directory is bind-mounted
into the container, so your data survives rebuilds.

## Data

Everything is saved to JSON files on the server (`data/tasks.json` and
`data/library.json`), written as a whole on every change. In Docker, those files
live in the host `./data` directory, so you can back them up or version-control
them directly. The library is seeded with three default prompts on first run if
`data/library.json` is missing or empty.

## Files
- `server.js` — Express backend + JSON file persistence + REST API
- `public/` — the frontend (ES modules, CSS, `index.html` skeleton)
- `data/` — auto-generated JSON stores (`tasks.json`, `library.json`)
- `AGENTS.md` — instructions for AI coding agents working on this codebase
- `dev-docs/` — detailed developer documentation (architecture, API, Docker)
- `README.md` — this file
