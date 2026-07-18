# Backend API Reference

The backend server is implemented as an Express application exposing simple JSON REST routes. Persistence is backed by Prisma + SQLite (`data/dev.db`); the legacy JSON files under `data/` are mirrors only and may lag the database.

## Endpoints

All routes are JSON. The source of truth is the SQLite database (`data/dev.db`)
accessed via Prisma; the legacy JSON files are mirrors only.

### 1. Tasks API
- **`GET /api/tasks`**
  - Returns: Array of all task items (across all boards).
  - Response Schema:
    ```json
    [
      {
        "id": "k8szg3j",
        "title": "Onboard payments-service repo",
        "repoName": "payments-service",
        "repoUrl": "https://github.com/org/payments-service",
        "agent": "Claude",
        "agentCustom": "",
        "column": "backlog",
        "laneId": "general",
        "boardId": "default",
        "tags": ["docs-gen", "build"],
        "notes": "Instruction notes...",
        "createdAt": "2026-07-15T20:00:00.000Z",
        "updatedAt": "2026-07-15T20:05:00.000Z"
      }
    ]
    ```
- **`POST /api/tasks`**
  - Payload: Entire array of tasks to replace the current state (all boards).
  - Returns: `{ "ok": true, "count": <n> }` on successful write.
- **`GET /api/boards/:boardId/tasks`**
  - Returns: Array of tasks for the given board.
- **`POST /api/boards/:boardId/tasks`**
  - Payload: Array of tasks to replace for the given board.
  - Returns: `{ "ok": true, "count": <n> }`.

### 2. Instruction Library API
- **`GET /api/library`**
  - Returns: Array of instruction/prompt items.
  - Response Schema:
    ```json
    [
      {
        "id": "l91jka8",
        "category": "Docs Generation",
        "title": "New Repo — Dev Docs Bootstrap",
        "body": "Instructions content...",
        "createdAt": "2026-07-15T20:00:00.000Z",
        "updatedAt": "2026-07-15T20:00:00.000Z"
      }
    ]
    ```
- **`POST /api/library`**
  - Payload: Entire array of instruction library entries to replace current state.
  - Returns: `{ "ok": true, "count": <n> }` on successful write.

### 3. Boards API
- **`GET /api/boards`** — Returns all boards.
- **`POST /api/boards`** — Replaces all boards (validated; each board must be uniquely identified). Returns `{ "ok": true, "count": <n> }`.
- **`GET /api/boards/:boardId`** — Returns a single board, or `404` if not found.
- **`PUT /api/boards/:boardId`** — Merges the request body into the existing board (id is fixed from the URL; `updatedAt` is refreshed). Returns `400` if the result is invalid, `404` if the board is missing.
- **`DELETE /api/boards/:boardId`** — Deletes the board and its cascade children (tasks, lanes, workflow states). Returns `400` if it is the last remaining board.

### 4. Workflow API
- **`GET /api/workflow`** — Returns all workflow states (across all boards).
- **`POST /api/workflow`** — Replaces all workflow states (validated). Returns `{ "ok": true, "count": <n> }`.
- **`GET /api/boards/:boardId/workflow`** — Returns workflow states for a board, ordered by `sortOrder`.
- **`POST /api/boards/:boardId/workflow`** — Replaces workflow states for a board.
- **`POST /api/boards/:boardId/workflow/delete`** — Deletes a workflow state. If tasks use that state, a valid `replacementStateId` must be supplied (tasks are reassigned). Returns `400` if the state is missing or would leave zero states.
- **`POST /api/workflow/delete`** — Same as above but operates across all boards/workflow states.

### 5. Lanes API
- **`GET /api/lanes`** — Returns all lanes (across all boards).
- **`POST /api/lanes`** — Replaces all lanes (validated). Returns `{ "ok": true, "count": <n> }`.
- **`GET /api/boards/:boardId/lanes`** — Returns lanes for a board, ordered by `sortOrder`.
- **`POST /api/boards/:boardId/lanes`** — Replaces lanes for a board.
- **`DELETE /api/boards/:boardId/lanes/:laneId`** — Deletes a lane. If tasks use that lane, a valid `replacementLaneId` must be supplied (tasks are reassigned). Returns `400` if the lane is missing or would leave zero lanes.
- **`POST /api/lanes/delete`** — Same as above but operates across all boards/lanes.

### 6. Board Import
- **`POST /api/boards/import`**
  - Purpose: Creates a **brand-new** board from a portable JSON bundle. It
    **never merges or overwrites** an existing board — every import yields a new
    board with server-generated IDs.
  - Request body shape:
    ```json
    {
      "schemaVersion": 1,
      "board": { "title": "Technical Foundation (Pre-Flight)", "description": "Trace Extractor phase 2" },
      "workflow": [ { "label": "backlog", "accent": "#8891A5", "isComplete": false } ],
      "lanes": [ { "label": "Environment & Tools", "accent": "#4FD1C5" } ],
      "tasks": [ { "title": "...", "repoName": "", "repoUrl": "", "agent": "Claude", "agentCustom": "", "notes": "", "tags": ["toolchain"], "columnIndex": 0, "laneIndex": 0, "createdAt": "2026-07-15T20:00:00.000Z", "updatedAt": "2026-07-15T20:00:00.000Z" } ]
    }
    ```
  - Fields:
    - `schemaVersion` (number) — bundle format version (currently `1`).
    - `board` — `{ title, description? }`; `title` is required, 1–200 chars.
    - `workflow` — non-empty array of `{ label, accent (6-digit hex), isComplete? }`.
    - `lanes` — non-empty array of `{ label, accent (6-digit hex) }`.
    - `tasks` — optional array; each task's `columnIndex` / `laneIndex` are
      0-based indices into `workflow` / `lanes` **in the same payload**.
      `createdAt` / `updatedAt` are optional (default `now`); `tags` is an
      optional array of strings.
  - Validation: `workflow` and `lanes` must each be a non-empty array; `board.title`
    must be 1–200 chars; each task's `columnIndex` / `laneIndex` must be integers
    in range of `workflow` / `lanes`. Any violation returns `400 { "error": "..." }`
    and the **entire** import is rejected (no partial writes).
  - Success: `201 { "ok": true, "boardId": "<id>" }`.

## Seeding
On startup, [`server.js`](server.js) calls `ensureSeeded()`, which seeds the
SQLite database (the source of truth) the first time it is empty — i.e. when no
boards exist. It creates:
- a default board (`default`),
- the default workflow states (`backlog`, `cloning`, `agent-docs`, `build-touch`, `done`),
- a default `general` lane, and
- three default library prompts (Dev Docs Bootstrap, Codebase Orientation, Pre-Build Sanity Check).

This replaces the old behavior of seeding `library.json` on the filesystem; the
JSON files are now only mirrors.
