# RECON.md — Ground-truth reconciliation before the Dexie migration

STEP 0 output. Drafted against the **actual** repo state on branch
`repo-ops-tracker-android` (base commit `754c47b`), not the handoff's prior
snapshot. Where the handoff and the repo disagree, the repo wins and it is
flagged below.

---

## (a) Prisma model → Dexie table map

Authoritative source: [`prisma/schema.prisma`](prisma/schema.prisma). One Dexie
table per model, **same field names**. Foreign keys become plain indexed
fields (no Dexie FK enforcement — integrity lives in `store.js`). Indexes are
chosen only for fields used in `where`/`orderBy` by the current routes (see
section b); no speculative indexes.

| Prisma model       | Dexie table    | Primary key | Secondary indexes (why)                                              |
| ------------------ | -------------- | ----------- | ------------------------------------------------------------------- |
| `Board`            | `boards`       | `id`        | `isDefault` (seed check / default lookup)                           |
| `WorkflowState`    | `workflows`    | `id`        | `boardId` (`where{boardId}`), `sortOrder` (orderBy)                  |
| `Lane`             | `lanes`        | `id`        | `boardId`, `sortOrder`                                               |
| `Task`             | `tasks`        | `id`        | `boardId` (`where{boardId}`), `laneId`, `column` (delete-reassign)  |
| `LibraryEntry`     | `library`      | `id`        | `type` (none strictly required; kept minimal — see note)            |
| `Attachment`       | `attachments`  | `id`        | `taskId`, `libraryEntryId` (owner lookups + cascade)                |
| `LibraryEntryTask` | `libraryTasks` | `++_pk`     | `entryId`, `taskId`, `[entryId+taskId]` (compound uniqueness)       |

Notes / deviations from a naive mapping:

- **`Task.tags`** is stored in SQLite as a JSON **string** and parsed by
  `mapDbTask()` into an array before it reaches the client. In Dexie we store
  `tags` as a **native array** (IndexedDB is structured-clone, no serialization
  needed). `store.js` therefore returns `tags` already as an array — same shape
  the client sees today — and does **no** `JSON.parse`/`stringify` at the store
  boundary. The export bundle path and import path are unaffected (they already
  work with arrays client-side).
- **`LibraryEntryTask`** is a Prisma composite-PK join (`@@id([entryId, taskId])`).
  Dexie compound primary keys are awkward for the upsert+diff pattern, so the
  table uses an auto-increment surrogate key `_pk` plus a **compound index
  `[entryId+taskId]`** to enforce/lookup uniqueness. Semantics (a link is the
  unordered pair) are preserved in `store.js`.
- **`Attachment`** gains a companion store `attachmentBlobs` (`id` PK, `blob`
  field) holding the binary. The `Attachment` metadata row keeps `storedName`
  for bundle/format parity, but on the client `storedName === id` (there is no
  disk file). Binary access goes through `saveAttachmentBlob` /
  `readAttachmentBlob` / `deleteAttachmentBlob` so a later swap to the Capacitor
  Filesystem plugin touches only those three helpers.
- **`LibraryEntry.lang`** is nullable (`String?`). Dexie cannot index `null`
  reliably and we don't query by `lang`, so it is a plain (unindexed) field.

## (b) Route → `store.js` function inventory

Authoritative operation set = the Express routes in [`server.js`](server.js).
The **client contract** that must stay byte-compatible is the set of functions
exported by [`public/js/api.js`](public/js/api.js) (every call site goes through
these). `store.js` exposes one async function per operation with the **same
input/output shape** the client already consumes. `api.js` is deleted; `app.js`
and `attachments.js` import from `store.js` instead.

| Express route                                  | Current `lib/db.js` fn / handler     | New `store.js` fn                         | Used by client? |
| ---------------------------------------------- | ------------------------------------ | ----------------------------------------- | --------------- |
| `GET /api/tasks`                               | `getAllTasks`                        | `getAllTasks()`                           | yes (`getAllTasksAcrossBoards`) |
| `POST /api/tasks`                              | `saveAllTasks`                       | `saveAllTasks(tasks)`                     | imported, unused → kept |
| `GET /api/tasks/:taskId/library`               | `getLibraryEntriesForTask`           | `getLibraryEntriesForTask(taskId)`        | exported, unused → kept |
| `GET /api/library`                             | `getAllLibraryEntries`               | `getAllLibraryEntries()`                  | yes             |
| `POST /api/library`                            | `saveAllLibraryEntries`              | `saveAllLibraryEntries(entries)`          | yes             |
| `GET /api/workflow`                            | `getAllWorkflows`                    | `getAllWorkflows()`                       | no → kept       |
| `POST /api/workflow` (+validWorkflow)          | `saveAllWorkflows`                   | `saveAllWorkflows(states)`                | no → kept       |
| `POST /api/workflow/delete`                    | inline reassign                      | `deleteWorkflowStateGlobal(...)`          | no → kept       |
| `GET /api/boards`                              | `getAllBoards`                       | `getAllBoards()`                          | yes             |
| `GET /api/boards/:boardId`                     | `getBoardById`                       | `getBoardById(id)`                        | yes             |
| `POST /api/boards` (+validBoards, KI-01)       | `saveAllBoards`                      | `saveAllBoards(boards)`                   | yes (saveBoards) |
| `POST /api/boards/generate`                    | `generateBoardDraft` (AI, server)    | **degraded** (see flag §c-3)              | yes (UI)        |
| `POST /api/boards/import`                       | `createBoardBundle` + index resolve  | `importBoard(bundle)`                     | yes             |
| `PUT /api/boards/:boardId`                     | `updateBoard`                        | `updateBoard(boardId, patch)`             | yes             |
| `DELETE /api/boards/:boardId`                  | `deleteBoardCascade` (+last guard)   | `deleteBoard(boardId)`                    | yes             |
| `GET /api/boards/:boardId/tasks`               | `getTasksByBoard`                    | `getTasksByBoard(boardId)`                | yes             |
| `POST /api/boards/:boardId/tasks`              | `saveTasksForBoard`                  | `saveTasksForBoard(boardId, tasks)`       | yes             |
| `GET /api/boards/:boardId/lanes`               | `getLanesByBoard`                    | `getLanesByBoard(boardId)`                | yes             |
| `POST /api/boards/:boardId/lanes`              | `saveLanesForBoard`                  | `saveLanesForBoard(boardId, lanes)`       | yes             |
| `DELETE /api/boards/:boardId/lanes/:laneId`    | inline reassign                      | `deleteBoardLane(boardId, laneId, repl)`  | yes             |
| `GET /api/boards/:boardId/workflow`            | `getWorkflowByBoard`                 | `getWorkflowByBoard(boardId)`             | yes             |
| `POST /api/boards/:boardId/workflow`           | `saveWorkflowForBoard`               | `saveWorkflowForBoard(boardId, states)`   | yes             |
| `POST /api/boards/:boardId/workflow/delete`    | inline reassign                      | `deleteBoardWorkflowState(boardId,...)`   | yes             |
| `GET /api/lanes`                               | `getAllLanes`                        | `getAllLanes()`                           | no → kept       |
| `POST /api/lanes` (+validLanes)                | `saveAllLanes`                       | `saveAllLanes(lanes)`                     | no → kept       |
| `POST /api/lanes/delete`                       | inline reassign                      | `deleteLaneGlobal(laneId, repl)`          | no → kept       |
| `GET /api/tasks/:taskId/attachments`           | `getAttachmentsForTask`              | `getAttachmentsForTask(taskId)`           | yes (attachments.js) |
| `POST /api/tasks/:taskId/attachments`          | `createAttachment` + multer          | `createAttachment(ownerType,id,fileMeta,blob)` | yes        |
| `GET /api/library/:entryId/attachments`        | `getAttachmentsForLibraryEntry`      | `getAttachmentsForLibraryEntry(entryId)`  | yes             |
| `POST /api/library/:entryId/attachments`       | `createAttachment` + multer          | (same as above)                           | yes             |
| `GET /api/attachments/:id/download`            | `res.download` from disk             | `getAttachmentBlobUrl(id)` (object URL)   | yes             |
| `DELETE /api/attachments/:id`                  | `deleteAttachment`                   | `deleteAttachment(id)`                     | yes             |

Server-side **validation** (`validWorkflow`, `validBoards`, `validImport*`,
board-construction guards, import index-resolution + library dedup) moves into
`store.js` verbatim so rejection cases and error **messages** match §Acceptance
#5. Cascade deletes replicate `onDelete: Cascade`, always parent-scoped.

## (c) Stale / contradicted-by-repo items in the handoff

1. **No Playwright in this repo.** The handoff mandates "Playwright regression
   tests (Acceptance #3, #5, #6)". The real test harness is a single
   `node test/api.test.js` that spawns `node server.js` and drives the REST API
   over HTTP (Node built-ins only; no Playwright, no `@playwright/test`, no
   browser deps installed). Since this migration deletes the server, that
   harness cannot run as-is. **Plan:** add `@playwright/test` + a headless
   Chromium run that serves `public/` statically and drives the real app
   (IndexedDB is real in-browser, ES modules load natively) — this is the
   correct environment for #3/#5/#6. If Chromium provisioning fails in this
   sandbox, fall back to a Node harness using `fake-indexeddb` to import
   `db.js`/`store.js` directly for #3/#5 and jsdom for #6, and say so in
   MIGRATION-NOTES. Either way the KI-01 + rollback + XSS assertions get run.

2. **KI-01 already resolved — commit hash differs.** Handoff/AGENTS both
   describe KI-01 fixed via upsert + scoped delete-diff. AGENTS says commit
   `675e6bf` (confirmed present in `git log`), *not* the `675e6bf`... (AGENTS
   text is correct; the older handoff draft's hash was stale). The discipline is
   already implemented across `saveAll*`/`save*ForBoard`/`saveAllLibraryEntries`
   (incl. the entry-task link diff). It **carries over unchanged** into
   `store.js`: every bulk/join save is upsert + scoped delete-diff inside a
   `db.transaction`, never clear-all-then-reinsert.

3. **AI board generation is inherently server-dependent and degrades.**
   `POST /api/boards/generate` → `lib/board-generator.js` calls
   `https://api.openai.com/...` using a **server-only secret** `OPENAI_API_KEY`.
   With no server there is no safe place for that key, so this feature **cannot**
   move client-side in this phase. `ctx.generateBoardDraft` keeps its signature
   and returns a clean `{ ok:false, error:'AI board generation requires a
   server and is unavailable in offline mode' }`; the UI already surfaces that
   as a toast. This is a **forced** behavioral deviation (documented, not a
   stub) — flagged for the next handoff to decide (optional remote endpoint vs.
   on-device model). Draft generation never wrote data, so nothing else changes.

4. **Server-generated import-ID exception is now moot (Rule 3 confirmed).**
   AGENTS documents "server-generated IDs for `/api/boards/import` are
   intentional." With no server, `importBoard` generates/validates IDs
   client-side with the same `uid()` algorithm. It still **always creates a new
   board** and never merges/overwrites (the bundle carries no db ids; workflow/
   lane refs are by array index, resolved to fresh ids at write time). The
   duplicate `validBoards()` definition in `server.js` (declared twice) is a
   pre-existing harmless redundancy; only one copy moves to `store.js`.

5. **`attachments.js` bypass confirmed and preserved.** It imports `../api.js`
   directly (the one sanctioned exception). Post-migration it imports the
   attachment helpers from `store.js` directly instead — still self-contained,
   still not routed through `ctx`. Its size-limit + type behavior is preserved
   (note: the size limit was enforced by multer server-side; it now moves into
   `store.js`/`attachments.js` client-side — see MIGRATION-NOTES).

6. **Board-selector XSS fix present.** `refreshBoardSelector()` in `app.js` and
   the manage-boards list in `boards.js` already `escapeHtml()` board titles/ids
   before `innerHTML`. Untouched by this migration; verified by Acceptance #6.

7. **`prefers-reduced-motion` guards present** in `public/styles/*.css`. Motion
   code is untouched; Acceptance #7 is verify-only.

8. **Bundle format = `schemaVersion: 2`** (see `boards.js:toPortableBundle`).
   Export/import already run client-side for the *bundle transform*; only the
   final persist call (`importBoardBundle` → `apiImportBoard`) currently hits the
   server. That single call is what moves to `store.js`. The bundle JSON
   structure is unchanged.

## Frozen `ctx` contract (for reference)

`ctx` keys consumed by components (names/args/returns preserved): `state`,
`COLUMNS`, `LANES`, `saveTasks`, `saveLibrary`, `saveWorkflow`,
`deleteWorkflowState`, `saveLanes`, `deleteLane`, `renderAll`,
`getAllTasksAcrossBoards`, `fetchBoardBundleSource`, `importBoardBundle`,
`generateBoardDraft`, `renameBoard`, `removeBoard`, `reloadBoards`,
`returnFromManageBoards`. Only the **bodies** of the app.js wrappers change
(fetch → `store.js`); component call sites are untouched.
