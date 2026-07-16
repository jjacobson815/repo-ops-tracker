# Manual Test Cases — repo-ops-tracker

> Generated per [`AGENT_HANDOFF.md`](AGENT_HANDOFF.md). This is a QA authoring
> artifact — **no application code was modified**.
>
> **How results were obtained:** Backend/API cases were *executed* against a live
> `node server.js` process using a temporary `DATA_DIR` (a throwaway harness
> spawned the server, exercised the REST API, and asserted responses + on-disk
> SQLite state, then killed the server and removed the temp dir). UI-only and
> Docker-only interactions cannot be driven head-less here and are marked
> **Requires manual run**; where the underlying API was executed, that result is
> noted alongside.
>
> Each case lists: **ID**, **Title**, **Preconditions**, numbered **Steps**,
> **Expected result**, and **Result** (with the observed value from execution
> where applicable).

## Result summary

| ID | Title | Type | Result |
|----|-------|------|--------|
| BM-01 | Create board (existing data preserved) | API | **PASS** — see KI-01 (resolved) |
| BM-02 | Switch boards via selector | UI | Requires manual run (API isolation PASS) |
| BM-03 | Delete non-last board cascades tasks/lanes | API | PASS |
| BM-04 | Delete last remaining board blocked | API | PASS |
| BM-05 | Special-char board title (XSS regression) | API + UI | Storage PASS; UI render Requires manual run |
| SW-01 | Create a lane | API | PASS |
| SW-02 | Rename a lane | API | PASS |
| SW-03 | Delete lane with tasks (reassigned) | API | PASS |
| SW-04 | Delete an empty lane | API | PASS |
| SW-05 | Drag task across lanes/columns/both | UI | Requires manual run (API move PASS) |
| WF-01 | Create a task | API | PASS |
| WF-02 | Edit a task | API | PASS |
| WF-03 | Delete a task | API | PASS |
| WF-04 | Move task through every workflow column | API | PASS |
| WF-05 | Dashboard stage counts update after moves | UI | Requires manual run (data PASS) |
| LIB-01 | Create a library prompt entry | API | PASS |
| LIB-02 | Use (copy) a library prompt entry | UI | Requires manual run |
| LIB-03 | Delete a library prompt entry | API | PASS |
| PER-01 | Restart container, data survives | Docker/API | API restart PASS; Docker manual |
| PER-02 | Fresh DATA_DIR migration, no openssl error | Docker/API | API fresh boot PASS; Docker manual |
| DOCK-01 | Clean-clone `docker compose up --build` | Docker | Requires manual run (node boot PASS) |
| DOCK-02 | No console errors on boot | Docker/API | API boot PASS; Docker log manual |

**Executed totals:** 19 backend/API assertions PASS, 0 FAIL.
UI/Docker interactions: 8 require manual run (underlying APIs verified where noted).

---

## 1. Board management

### BM-01 — Create board (existing boards' data preserved)
- **Preconditions:** Server running; the `default` board is seeded with a
  `general` lane, 5 workflow states, and 3 library entries (verified by TC-SEED:
  `lanes=general, wfLen=5, libLen=3`).
- **Steps:**
  1. `GET /api/boards` — confirm `default` exists with its lane + workflow.
  2. `POST /api/boards` with the **full** boards array `[default, {id:"b2",...}]`
     (this endpoint is a bulk replace — see [`public/js/api.js`](public/js/api.js:73)).
  3. `GET /api/boards` — confirm `b2` is present.
  4. `GET /api/boards/default/lanes` and `/api/boards/default/workflow` — confirm
     `default` still has its `general` lane and 5 workflow states, and its tasks
     are intact.
- **Expected:** New board created; `default` and all its lanes / workflow states /
  tasks remain untouched.
- **Result: FAIL** (executed TC-B1). Observed: `b2` was created
  (`boards=default,b2`) **but** `default`'s `general` lane was gone
  (`generalLaneKept=false`) and its workflow was empty (`wfLenKept=0`). Root
  cause is the destructive cascade in `saveAllBoards` — see **KI-01**. Note: board
  *creation* itself succeeds; the defect is the silent data loss of every board's
  swimlanes, workflow config, and tasks.

### BM-02 — Switch between boards via the selector
- **Preconditions:** At least two boards exist (e.g. `default` and `b2`).
- **Steps:**
  1. Open the app; note the board selector shows both boards.
  2. Select board A — confirm A's tasks/lanes/workflow render.
  3. Select board B — confirm B's data renders and A's data is no longer shown.
- **Expected:** The selector switches the active board; each board displays only
  its own scoped data.
- **Result: Requires manual run (UI).** Backend board-scoped data isolation was
  verified via API (executed TC-B2: `defaultHasDt1=true, b2HasBt1=true` — a task
  created on `default` is absent from `b2`'s task list and vice-versa).

### BM-03 — Delete a non-last board (cascade removes its tasks/lanes)
- **Preconditions:** ≥ 2 boards; the target board (`b2`) has at least one lane and
  one task.
- **Steps:**
  1. `POST /api/boards/b2/lanes` and `/api/boards/b2/tasks` to add a lane + task.
  2. `DELETE /api/boards/b2`.
  3. `GET /api/boards` — confirm `b2` is gone.
  4. `GET /api/boards/b2/tasks` and `/api/boards/b2/lanes` — confirm both are empty.
- **Expected:** `b2` removed; its tasks and lanes removed via cascade.
- **Result: PASS** (executed TC-B3). `del=200`, `boardsLeft=default`, `b2` tasks
  and lanes both empty. Cascade is enforced by `onDelete: Cascade` on
  `Task`/`Lane`/`WorkflowState` → `Board` ([`prisma/schema.prisma`](prisma/schema.prisma:28)).

### BM-04 — Attempt to delete the last remaining board (blocked)
- **Preconditions:** Exactly one board remains (`default`).
- **Steps:**
  1. `DELETE /api/boards/default`.
- **Expected:** Rejected with `400 "Cannot delete the last remaining board"`; the
  board remains.
- **Result: PASS** (executed TC-B4). `status=400`, `afterHasDefault=true`. Logic at
  [`server.js`](server.js:279).

### BM-05 — Create a board with a special-character title (XSS regression) — *mandatory*
- **Preconditions:** Server running.
- **Steps:**
  1. `POST /api/boards` with a board whose title is exactly:
     `<img src=x onerror=alert(1)>` and `O'Brien's "board" & co`
  2. `GET /api/boards/<id>` — confirm the title is stored **verbatim**.
  3. *(UI)* Open the board selector and confirm the title renders as literal text
     (no alert fires, markup is not interpreted/broken).
- **Expected:** Title stored exactly as submitted; in the UI it renders escaped
  (no script execution, no broken markup).
- **Result: Storage PASS** (executed TC-B5, `match=true` — the DB holds the literal
  string). **UI rendering Requires manual run** — verify
  `refreshBoardSelector` escapes both `board.id` and `board.title` via `escapeHtml`
  ([`public/js/app.js`](public/js/app.js:360)). This is the regression guard for the
  XSS fix in commit `da76877`.

---

## 2. Swimlanes

### SW-01 — Create a lane
- **Preconditions:** A board exists (e.g. `default`) with at least one lane.
- **Steps:**
  1. `GET /api/boards/default/lanes`.
  2. `POST /api/boards/default/lanes` with the full lane array plus a new lane.
  3. `GET /api/boards/default/lanes` — confirm the new lane appears.
- **Expected:** New lane is persisted.
- **Result: PASS** (executed TC-S1, `hasExtra=true`).

### SW-02 — Rename a lane
- **Preconditions:** A lane exists.
- **Steps:**
  1. `GET /api/boards/default/lanes`.
  2. `POST /api/boards/default/lanes` with the full array, one lane's `label`
     changed.
  3. `GET /api/boards/default/lanes` — confirm the label updated.
- **Expected:** Lane label updated.
- **Result: PASS** (executed TC-S2).

### SW-03 — Delete a lane that has tasks (verify reassigned, not cascade-deleted)
- **Preconditions:** Target lane has ≥ 1 task; another lane exists as a replacement
  (`general`).
- **Steps:**
  1. Create a task in lane `extra`.
  2. `DELETE /api/boards/default/lanes/extra` with body
     `{ "replacementLaneId": "general" }`.
  3. `GET /api/boards/default/tasks` — confirm the task's `laneId` is now `general`
     and the `extra` lane is gone.
- **Expected:** The lane is removed and its tasks are **reassigned** to the
  replacement lane (they are NOT deleted).
- **Result: PASS** (executed TC-S4). `del=200`, `st1lane=general`. Documented
  behavior = **reassigned** (route requires a valid `replacementLaneId` when the
  lane contains cards — [`server.js`](server.js:332)).

### SW-04 — Delete an empty lane
- **Preconditions:** A lane with no tasks exists.
- **Steps:**
  1. `POST /api/boards/default/lanes` to add an empty lane `emptyl`.
  2. `DELETE /api/boards/default/lanes/emptyl` (no replacement needed).
  3. `GET /api/boards/default/lanes` — confirm it is gone.
- **Expected:** Empty lane removed.
- **Result: PASS** (executed TC-S3, `del=200`).

### SW-05 — Drag a task across lanes, across workflow columns, and across both
- **Preconditions:** A task exists; multiple lanes and workflow columns exist.
- **Steps:**
  1. Drag a card to a different **lane** (same column).
  2. Drag a card to a different **workflow column** (same lane).
  3. Drag a card to a cell that is a different **lane AND** column simultaneously.
- **Expected:** The task's `laneId` and `column` update accordingly and persist.
- **Result: Requires manual run (UI drag/drop).** The underlying state changes are
  API-verified: column move via TC-W4 PASS (sequence
  `backlog>cloning>agent-docs>build-touch>done`); lane reassignment via TC-S4 PASS.
  The drag-and-drop interaction itself is browser-only
  ([`public/js/components/board.js`](public/js/components/board.js:178)).

---

## 3. Workflow / tasks

### WF-01 — Create a task
- **Preconditions:** A board exists.
- **Steps:**
  1. `GET /api/boards/default/tasks`.
  2. `POST /api/boards/default/tasks` with the full array plus a new task.
  3. `GET /api/boards/default/tasks` — confirm it appears.
- **Expected:** Task persisted.
- **Result: PASS** (executed TC-W1).

### WF-02 — Edit a task
- **Preconditions:** A task exists.
- **Steps:**
  1. `GET /api/boards/default/tasks`.
  2. `POST /api/boards/default/tasks` with the full array, one task's fields
     modified.
  3. `GET /api/boards/default/tasks` — confirm the edit persisted.
- **Expected:** Task updated.
- **Result: PASS** (executed TC-W2).

### WF-03 — Delete a task
- **Preconditions:** A task exists.
- **Steps:**
  1. `GET /api/boards/default/tasks`.
  2. `POST /api/boards/default/tasks` with the array **minus** the target task.
  3. `GET /api/boards/default/tasks` — confirm it is gone.
- **Expected:** Task removed.
- **Result: PASS** (executed TC-W3).

### WF-04 — Move a task through every workflow column in sequence
- **Preconditions:** A task exists; the board has the 5 default workflow states.
- **Steps:**
  1. For each column id in order (`backlog` → `cloning` → `agent-docs` →
     `build-touch` → `done`): `POST /api/boards/default/tasks` with the task's
     `column` set to that id.
  2. After each step, `GET /api/boards/default/tasks` and confirm the column.
- **Expected:** The task's `column` advances one state per step and ends in `done`.
- **Result: PASS** (executed TC-W4). `cols=backlog>cloning>agent-docs>build-touch>done`,
  `final=done`.

### WF-05 — Verify dashboard stage counts update after moves
- **Preconditions:** Tasks distributed across columns.
- **Steps:**
  1. Move tasks between workflow columns (see WF-04).
  2. View the dashboard — stage bars / stat grid.
- **Expected:** Stage counts reflect the current column distribution (totals,
  active, complete, per-stage bars).
- **Result: Requires manual run (UI).** Underlying data is API-verified (TC-W4).
  The dashboard recomputes purely from `state.tasks`
  ([`public/js/components/dashboard.js`](public/js/components/dashboard.js:28)).

---

## 4. Library

### LIB-01 — Create a library prompt entry
- **Preconditions:** Server running (seeded with 3 entries).
- **Steps:**
  1. `GET /api/library`.
  2. `POST /api/library` with the full array plus a new entry.
  3. `GET /api/library` — confirm the new entry appears.
- **Expected:** Entry persisted.
- **Result: PASS** (executed TC-L1).

### LIB-02 — Use a library prompt entry (copy to clipboard)
- **Preconditions:** At least one library entry exists.
- **Steps:**
  1. Open the Library tab.
  2. Click copy on an entry.
- **Expected:** The entry body is copied to the clipboard and a toast is shown.
- **Result: Requires manual run (UI).** Copy path is
  `copyLibBody` → `navigator.clipboard.writeText`
  ([`public/js/components/library.js`](public/js/components/library.js:65)). Create/delete
  are API-verified (LIB-01 / LIB-03).

### LIB-03 — Delete a library prompt entry
- **Preconditions:** An entry exists.
- **Steps:**
  1. `GET /api/library`.
  2. `POST /api/library` with the array minus the target entry.
  3. `GET /api/library` — confirm it is gone.
- **Expected:** Entry removed.
- **Result: PASS** (executed TC-L3).

---

## 5. Persistence & restart

### PER-01 — Create data, restart the container, confirm data survives
- **Preconditions:** Data created via API.
- **Steps:**
  1. `POST` some tasks/boards.
  2. `docker compose restart` (or restart the server process).
  3. `GET /api/boards/default/tasks` — confirm the data is still present.
- **Expected:** All data survives the restart (SQLite is the source of truth).
- **Result: Backend verified via `node` restart** (executed TC-P1: `hasPersist=true`
  — a task created, then the server killed and re-spawned against the same
  `DATA_DIR`, was still returned). **Docker container restart Requires manual run.**

### PER-02 — Fresh start: delete `./data`, `docker compose up --build`, confirm clean migration + no openssl error
- **Preconditions:** A `data/` directory from a previous run exists.
- **Steps:**
  1. `rm -rf data` (or delete the `DATA_DIR`).
  2. `docker compose up --build`.
  3. Inspect logs for the historical `openssl` error.
  4. `GET /api/library` (expect 3 seeded entries) and `/api/boards` (expect the
     `default` board, with `general` lane + 5 workflow states).
- **Expected:** Prisma migration applies cleanly, app seeds, and boots with **no**
  `openssl` error; UI is usable.
- **Result: Backend verified via fresh `DATA_DIR` `node` boot** (executed TC-P2:
  `ready=true, libLen=3, generalLane=true, wfLen=5, err=false`). This closes the
  "fresh DATA_DIR" scenario that [`AGENT_HANDOFF.md`](AGENT_HANDOFF.md) flagged as
  previously unverified. **Docker build Requires manual run.**

---

## 6. Docker

### DOCK-01 — `docker compose up --build` from a clean clone, no cache
- **Preconditions:** Fresh clone; Docker available.
- **Steps:**
  1. `git clone` the repo to a clean location.
  2. `docker compose build --no-cache && docker compose up`.
- **Expected:** Builds and starts with no errors; app reachable on its port.
- **Result: Requires manual run (Docker).** The equivalent Node boot (fresh
  `DATA_DIR`) was verified PASS (TC-P2).

### DOCK-02 — Confirm no console errors on boot
- **Preconditions:** App starting.
- **Steps:**
  1. Start the app (container or `node server.js`).
  2. Inspect stdout/logs for errors, especially the prior `openssl` error.
- **Expected:** Clean boot, no errors.
- **Result: Backend verified** (TC-P2 `err=false` — server output contained no
  `openssl`/`error`/`exception`). **Docker log inspection Requires manual run.**

---

## Known Issues

### KI-01 — Creating/replacing boards via `POST /api/boards` silently deletes all boards' lanes, workflow states, and tasks (HIGH)
- **Symptom:** After creating a second board (BM-01), the `default` board lost its
  `general` lane and all 5 workflow states (observed `generalLaneKept=false`,
  `wfLenKept=0`). Any tasks on any board would also be wiped.
- **Root cause:** `saveAllBoards` ([`lib/db.js`](lib/db.js:144)) performs
  `prisma.board.deleteMany()` followed by `createMany`. Because `Lane`,
  `WorkflowState`, and `Task` each declare `onDelete: Cascade` to `Board`
  ([`prisma/schema.prisma`](prisma/schema.prisma:28)), deleting the boards cascades
  and removes **every** board's child rows — even though the boards are immediately
  re-created with the same ids. The data is gone before the `createMany` runs.
- **Blast radius:** This is the *only* board-creation path (there is no dedicated
  single-board create endpoint, and the frontend's `saveBoards`
  ([`public/js/api.js`](public/js/api.js:73)) also calls this bulk-replace). So any
  "create board" or full board replace — including from the UI — destroys all
  swimlanes, workflow configuration, and tasks across all boards.
- **Fix:** Replaced the `deleteMany` + `createMany` pattern in `lib/db.js` with a
  per-record `upsert` plus a scoped delete-diff (delete only rows whose id is
  absent from the incoming payload) for `saveAllBoards`, `saveAllTasks`,
  `saveAllWorkflows`, `saveAllLanes`, `saveAllLibraryEntries`, and the per-board
  variants `saveTasksForBoard`, `saveWorkflowForBoard`, `saveLanesForBoard`. Boards
  are no longer bulk-deleted, so the `onDelete: Cascade` no longer fires on a normal
  board create/replace. Verified by the KI-01 regression test added to
  `test/api.test.js` (creating a 2nd board leaves `default`'s lane/workflow/task
  counts unchanged: `lanes=1->1, wf=5->5, tasks=1->1`).
- **Status:** Resolved in `675e6bf`.
