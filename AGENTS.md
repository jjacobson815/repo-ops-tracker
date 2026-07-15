# AGENTS.md — repo-ops-tracker

> **Note:** This file supersedes the old single-file `AGENTS.md` conventions. The
> app was refactored from a single `index.html` (browser `localStorage`) into a
> modular, server-backed app. The authoritative spec is
> [`agent_build_instructions.md`](agent_build_instructions.md) and the detailed
> design lives in [`dev-docs/Index.md`](dev-docs/Index.md).

## What this is
A local-first but now **server-backed** web app: personal kanban board + dashboard
+ AI-agent instruction library. A single-page frontend is served by an Express
server; data is persisted to JSON files on the server (not `localStorage`).

## Stack
- **Backend:** Node.js + Express (`server.js`, `package.json` with a single
  `express` dependency, `"type": "commonjs"`). Serves the `public/` directory
  statically and exposes a small JSON REST API.
- **Frontend:** native **ES modules** under `public/` — no bundler, no build step,
  no framework. Bootstrapped by `<script type="module" src="js/app.js">` in
  `public/index.html`.
- **Fonts:** two Google Fonts loaded via `<link>` (IBM Plex Mono, Inter) — the
  only external calls.
- **Persistence:** file-based JSON on the server — `data/tasks.json` and
  `data/library.json`. In Docker the host `./data` directory is bind-mounted to
  `/app/data` so data survives container rebuilds.

## Running it
- **Local (Node):** install deps then start the server:
  ```bash
  npm install
  node server.js
  ```
  then visit `http://localhost:8787`. (`npm install` is now required — one
  dependency: `express`.)
- **Docker:** `docker compose up --build` (per [`dev-docs/Index.md`](dev-docs/Index.md)),
  then visit `http://localhost:8787`.

## Conventions
- All app logic lives in `public/js/*` ES modules — **not** a single `<script>`
  block in `index.html`. `public/index.html` is the structural skeleton only
  (tabs, view containers, modal markup); styles and scripts are split out.
- Design tokens (colors, fonts, radius) are CSS variables under `:root` in
  `public/styles/variables.css`. Change the palette there, not by hardcoding hex
  values in individual rules.
- `COLUMNS` (kanban stages) is defined **once** in `public/js/app.js` and exported
  for reuse by `board.js` / `modal.js`. Add or rename stages there — don't
  hardcode column ids elsewhere.
- Two data collections, each a flat JSON array persisted as a whole on every
  mutation (whole-array replace via `POST /api/tasks` and `POST /api/library`):
  - `tasks` — kanban cards (fields: id, title, repoName, repoUrl, agent,
    agentCustom, column, tags, notes, createdAt, updatedAt)
  - `library` — saved AI-agent prompts (fields: id, title, category, body,
    createdAt, updatedAt)
- The library is seeded with three default prompts on first run if
  `data/library.json` is missing or empty (see `server.js` `seedLibrary()`).
- Any destructive action (delete task, delete library entry) must go through
  `askConfirm(message, onConfirm)` in `public/js/components/modal.js`. Do not wire
  a delete button straight to a mutation.

## Do not
- Do not swap the file-based JSON persistence (`data/*.json`) for a remote/SQL
  backend without being asked.
- Do not introduce a frontend framework or a bundler/build step without being asked.
- Do not remove or bypass the delete-confirmation flow.

## Testing
No automated tests. Manually verify against the **running server** after any
change: add/edit/delete a task via the UI, drag a card between columns, add/edit/
delete a library entry, refresh the page and confirm the data persisted to
`data/tasks.json` / `data/library.json`, and confirm the delete confirmation
dialog appears for both task and library deletes.
