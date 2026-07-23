# MIGRATION-NOTES.md — Express/Prisma/SQLite → client-side Dexie/IndexedDB

Phase 1 of the Android/Capacitor port. See [`RECON.md`](RECON.md) for the
ground-truth reconciliation this migration was built against.

## Summary

The server (`server.js`, `lib/db.js`, Prisma/SQLite) is gone from the runtime
path. All persistence now lives client-side in IndexedDB via **Dexie 4.4.4**
(vendored at [`public/js/vendor/dexie.mjs`](public/js/vendor/dexie.mjs), no
CDN/runtime dependency). The app runs from static files only — verified with
`node scripts/serve.mjs` (a zero-dependency Node static server; any static
host works identically, including Capacitor's local scheme later).

- [`public/js/db.js`](public/js/db.js) — Dexie instance + schema (RECON.md §a).
- [`public/js/store.js`](public/js/store.js) — data-access layer; one function
  per former route (RECON.md §b), transaction-wrapped, KI-01 upsert+diff
  discipline preserved throughout.
- [`public/js/app.js`](public/js/app.js) — `ctx` wrappers now call `store.js`
  directly instead of `fetch`; the `ctx` contract itself (names/args/returns
  consumed by components) is **unchanged**.
- [`public/js/components/attachments.js`](public/js/components/attachments.js) —
  still self-contained / bypasses `ctx`; now calls `store.js` instead of
  `api.js`. Binaries live in a dedicated `attachmentBlobs` Dexie table behind
  three helpers (`saveAttachmentBlob`/`readAttachmentBlob`/`deleteAttachmentBlob`
  in `store.js`) so a later swap to the Capacitor Filesystem plugin touches
  only those.
- `public/js/api.js` — **deleted** (dead networking code, no remaining
  importers).
- `server.js`, `lib/`, `prisma/`, `test/api.test.js`,
  `scripts/migrate-json-to-sqlite.js`, `scripts/create-prompt-ops-board.js`,
  `scripts/seed-board-data.js` — **moved to `legacy-server/`**, not deleted.
- [`scripts/export-sqlite-to-bundle.mjs`](scripts/export-sqlite-to-bundle.mjs) —
  one-shot dev migration helper (reads `legacy-server`'s SQLite via Prisma,
  emits standard `schemaVersion: 2` import bundles — reuses the existing
  bundle format, no bespoke migration path).
- [`scripts/serve.mjs`](scripts/serve.mjs) — zero-dependency static file
  server (`npm start` / `npm run serve`).
- `package.json` — server deps (`express`, `multer`, `dompurify`, `marked`,
  `@prisma/client` as a *runtime* dep) removed. `@prisma/client` + `prisma`
  remain as **devDependencies** only, for the optional one-shot migration
  script. `@playwright/test` added for the new e2e suite.

## Route → `store.js` function mapping

See [`RECON.md` §b](RECON.md#b-route--storejs-function-inventory) for the full
table. Every route that had a client call site in the old `api.js` has a
same-shape `store.js` counterpart; a few server-only routes (`GET/POST
/api/lanes`, `GET/POST /api/workflow`, the two `*/delete` global variants)
were never called by the client and were ported anyway for completeness/parity
but have no caller.

## Signature deviations from the frozen `ctx` contract (Rule 1)

The `ctx` contract itself is untouched — every deviation below is *internal*
to a wrapper or to the self-contained `attachments.js`, not a `ctx`-facing
break:

1. **`store.js` throws instead of returning `{status, body}`.** The old
   `api.js` functions returned a `Response`-like object (`res.ok`,
   `res.json()`); `store.js` functions either resolve with the payload or
   `throw` a `StoreError` carrying the **same error message** the old route
   returned. Every `ctx` wrapper in `app.js` was updated to catch and surface
   `e.message` instead of parsing a JSON error body — the wrapper's own
   `{ok, error}`/`{ok, ...}` **return shape to components is identical**.
2. **`attachmentDownloadUrl(id)` → `attachmentObjectUrl(id)` is now async.**
   The old function was a synchronous string builder for a server route. With
   binaries in IndexedDB, resolving a downloadable URL means reading the Blob
   and calling `URL.createObjectURL`, which is inherently async. This is
   internal to `attachments.js` (not part of the frozen `ctx` contract) —
   `mountAttachments` now resolves all attachment URLs before rendering the
   list and revokes the previous mount's object URLs on re-render/re-mount to
   avoid leaking blob URLs.
3. **AI board generation degrades gracefully (forced, not a stub).**
   `ctx.generateBoardDraft(brief)` keeps its exact signature and return shape
   (`{ok, bundle}` / `{ok:false, error}`) but always returns
   `{ ok:false, error:'AI board generation requires a server and is
   unavailable in offline mode' }`. The feature calls `https://api.openai.com`
   with a **server-only secret** (`OPENAI_API_KEY`) — see RECON.md §c-3. There
   is no client-safe place to hold that key, so this is out of scope for this
   phase by necessity, not oversight. The UI's existing toast/error path
   already surfaces this cleanly with no code changes needed there.
4. **Two previously-broken `ctx` paths are now correct.** `ctx.saveLanes` and
   `ctx.deleteLane` (used by `lanes.js`) called `saveBoardLanes` /
   `deleteBoardLane`, which were **referenced but never imported** in the old
   `app.js` — both `save lanes` and `delete lane` actions were silently broken
   (`ReferenceError` swallowed by the `try/catch`, always surfacing "save
   failed"/"could not delete lane"). Both are now correctly imported from
   `store.js` and functional. Flagged here per Rule 1 since it's a behavior
   *improvement*, not a regression, but worth knowing this wasn't "working
   before" to compare against.

## Data-shape notes

- **`Task.tags`** is a native array in IndexedDB (not a JSON string — see
  RECON.md §a). `store.js` never `JSON.parse`/`stringify`s it; the shape the
  client sees is identical to before (Prisma's `mapDbTask` already did this
  parsing server-side).
- **`LibraryEntryTask`** join rows use a Dexie surrogate key (`_pk`
  autoincrement) instead of Prisma's composite PK, with a compound index
  `[entryId+taskId]` for the same uniqueness guarantee. External shape
  (`LibraryEntry.taskIds: string[]`) is unchanged.
- **Attachment size limit (25MB)** — previously enforced by multer
  server-side; now enforced in `store.uploadAttachment` client-side
  (`fail('File too large')` when `file.size > 25 * 1024 * 1024`). Same limit,
  same effective behavior, enforcement point moved.

## Acceptance results

Run via `npm test` (`playwright test`, headless Chromium, `test/e2e.spec.mjs`,
serving `public/` via `scripts/serve.mjs` with **no server running**):

```
Running 5 tests using 1 worker
  ok  #1 app loads fully static (no server) and seeds a default board
  ok  #2 board/column/card CRUD persists across a full reload
  ok  #3 KI-01: bulk board save + bulk join save leaves the OTHER board byte-identical
  ok  #5 malformed bundle import fails with the same message and leaves DB unmodified
  ok  #6 board selector renders an untrusted board name inertly (XSS)
5 passed
```

| # | Criterion | Result |
| - | --------- | ------ |
| 1 | Loads/functions fully static, server not running | **PASS** — e2e + manual browser smoke test (dashboard, board, manage-boards all rendered with zero console errors) |
| 2 | Board/column/card CRUD; survives full reload | **PASS** — e2e test + manual: created a task via the real UI modal, reloaded, task persisted with tags as an array |
| 3 | KI-01 regression (bulk save on board A leaves board B untouched), automated | **PASS** — Playwright test exercises `saveAllBoards` (classic KI-01 trigger), `saveTasksForBoard`, and `saveAllLibraryEntries` against board A; board B's tasks/lanes/workflow/library-links are structurally identical before/after |
| 4 | Export (old server) → import (new local) round-trip, incl. attachments | **PASS** — ran the actual round trip: booted `legacy-server/server.js` against a scratch `DATA_DIR`, created a task + library instruction + task↔instruction link over its REST API, ran `node scripts/export-sqlite-to-bundle.mjs` (produces the exact `schemaVersion: 2` shape `boards.js:toPortableBundle` already produces/consumes), then fed the emitted bundle into `store.importBoard` inside a real browser (Playwright). Result: board, all 5 workflow states, the lane, the task (title/repo/tags/notes intact), and the library entry with its `taskIds` link all landed correctly under fresh client-side ids. Attachments are out of scope for this check — bundles never included binaries in either implementation (attachment blobs are per-device by design, before and after this migration). |
| 5 | Malformed bundle import fails with same error message, DB unmodified | **PASS** — e2e test asserts the exact message `'a task is invalid or has an out-of-range columnIndex/laneIndex/libraryIndexes entry'` and that board/library counts are unchanged (validation runs before the transaction opens) |
| 6 | Board selector renders untrusted names inertly (XSS) | **PASS** — e2e test injects `<img src=x onerror=...>` as a board title; asserts no live `<img>` in the selector, no dialog fired, no global flag set |
| 7 | `prefers-reduced-motion` unchanged | **PASS (verify-only)** — no CSS/motion code touched by this migration; confirmed present in `public/styles/*.css` |
| 8 | No `fetch` to `localhost` anywhere in the client | **PASS** — `grep -rn "fetch(" public/js/` returns no matches (api.js, the only file that used fetch, is deleted) |

### Note on Acceptance #3/#5/#6 tooling (RECON.md §c-1)

The handoff assumed Playwright was already in place; it wasn't (the existing
harness was a Node script driving the old Express server over HTTP, which is
obsolete now that the server is gone). `@playwright/test` + headless Chromium
were installed fresh for this migration and are the correct environment for
these three criteria (real IndexedDB, real ES module loading, real DOM/XSS
behavior) — this is a durable addition, not a workaround. See
`playwright.config.mjs` and `test/e2e.spec.mjs`.

## Known follow-ups (next handoff / out of scope here)

- AI board generation (`ctx.generateBoardDraft`) is a hard no-op offline; a
  future phase should decide between a remote endpoint call from the Capacitor
  shell or dropping the feature.
- Capacitor install/config, RevenueCat/feature gating, moving attachment blobs
  to native filesystem, and multi-user/sync remain explicitly out of scope
  (per the original handoff).
