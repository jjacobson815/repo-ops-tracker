# AGENTS.md — AI Coding Agent Guide (repo-ops-tracker)

Concise entry point for AI coding agents working in this repo.
For historical (pre-Dexie) architecture / backend API / Docker docs, see
[dev-docs/Index.md](dev-docs/Index.md) — those describe the retired
Express/Prisma server, now under `legacy-server/`.

## Current stack (client-only, Android/Capacitor prep — Phase 1)
- **No server.** The app runs entirely from static files. `npm start` /
  `npm run serve` launches [`scripts/serve.mjs`](scripts/serve.mjs), a
  zero-dependency Node static file server — any static host works
  identically, including Capacitor's local scheme in a later phase.
- **Persistence: Dexie (IndexedDB) is the source of truth.** Schema:
  [`public/js/db.js`](public/js/db.js). One Dexie table per the former Prisma
  model (see `legacy-server/prisma/schema.prisma` for the historical shape
  this was derived from). Dexie is vendored at
  [`public/js/vendor/dexie.mjs`](public/js/vendor/dexie.mjs) (no CDN, no
  build step).
- **Data-access layer:** [`public/js/store.js`](public/js/store.js) — one
  async function per former REST route, same input/output shape components
  already consumed. This is what `app.js`'s `ctx` wrappers and
  `attachments.js` call.
- **Frontend:** native ES modules under `public/` (no bundler/framework) —
  unchanged.
- **Boards are plural.** Each board owns its own lanes and workflow states,
  scoped by `boardId` (not one global set). The manage-lanes UI lives in
  [`public/js/components/lanes.js`](public/js/components/lanes.js:1).
- **`legacy-server/`** holds the retired Express/Prisma/SQLite server
  (`server.js`, `lib/`, `prisma/`, the old `test/api.test.js`, and
  server-only scripts) — kept for reference and for the one-shot migration
  script below, excluded from `npm start`/`npm test`. Do not wire it back
  into the running app; treat it as historical.

## Transaction / upsert-diff rule (carries over from the old server)
Every multi-table write in `store.js` runs inside `db.transaction('rw', ...)`.
Every bulk or join-table save uses **upsert + scoped delete-diff** (compute
the add/update/remove delta against the current rows and apply only that) —
**never** clear-all-then-reinsert. This is the KI-01 discipline (see below),
and it must be preserved in any new bulk-save code added to `store.js`.

## How to verify behavior
- Run `npm start`, open the served URL, and inspect IndexedDB via the
  browser's DevTools → Application → IndexedDB → `repo-ops-tracker`. There is
  no server-side database file to check.
- `npm test` runs the Playwright e2e suite ([`test/e2e.spec.mjs`](test/e2e.spec.mjs),
  see `playwright.config.mjs`) against the real static app in headless
  Chromium — real IndexedDB, real ES modules, real DOM. This is the
  authoritative regression suite going forward (see
  [MIGRATION-NOTES.md](MIGRATION-NOTES.md) for why it replaced the old
  server-driven `test/api.test.js`).

## Useful scripts
- `npm start` / `npm run serve` — serve `public/` statically
  ([`scripts/serve.mjs`](scripts/serve.mjs)).
- `npm test` / `npm run test:e2e` — Playwright acceptance suite.
- `npm run migrate:export-bundle` — one-shot dev helper
  ([`scripts/export-sqlite-to-bundle.mjs`](scripts/export-sqlite-to-bundle.mjs)):
  reads a **legacy** `data/dev.db` via Prisma and emits one standard
  `schemaVersion: 2` import bundle per board (same format
  `boards.js:toPortableBundle` already produces). Import each emitted file
  through the app's manage-boards "import" button to bring old data into
  IndexedDB. Requires the legacy Prisma client
  (`npx prisma generate --schema legacy-server/prisma/schema.prisma`) if not
  already generated.

## Where to look first
- `public/js/db.js` — Dexie schema.
- `public/js/store.js` — data-access layer (route-equivalent functions,
  validation, transactions, cascades).
- `public/js/app.js` — `ctx` wrappers over `store.js`; component call sites
  are unchanged from before this migration.
- `public/js/components/attachments.js` — self-contained attachment widget
  (bypasses `ctx`, talks to `store.js` directly).
- [`RECON.md`](RECON.md) — the model/route inventory this migration was built
  against, and every place the original handoff spec was stale vs. the repo.
- [`MIGRATION-NOTES.md`](MIGRATION-NOTES.md) — route→function mapping,
  signature deviations, and acceptance-criteria results for the Dexie
  migration.

## Known issues
- **KI-01 (RESOLVED, carried over)** — bulk board/task/workflow/lane/library
  saves must never `deleteMany`-then-`createMany` (or the Dexie equivalent,
  clear-then-bulkPut) a whole table, because cascade relations would wipe
  every board's children on any board create/replace. The fix — per-record
  upsert plus a **scoped** delete-diff (delete only rows whose id is absent
  from the incoming payload) — is implemented across `store.js`'s
  `saveAll*`/`save*ForBoard`/`saveAllLibraryEntries` functions and covered by
  the KI-01 regression test in `test/e2e.spec.mjs` (acceptance #3). Originally
  fixed server-side in commit `675e6bf`; do not reintroduce a
  clear-then-reinsert pattern anywhere in `store.js`.
- **AI board generation is unavailable offline (by necessity).**
  `ctx.generateBoardDraft` always returns `{ok:false, error:'AI board
  generation requires a server and is unavailable in offline mode'}`. The
  feature needs a server-only secret (`OPENAI_API_KEY`) to call the OpenAI
  API and there is no server anymore. See MIGRATION-NOTES.md for the
  reasoning; do not attempt to move the API key into client code.

## Conventions
- `escapeHtml()` is duplicated locally in each frontend component that renders
  user-supplied data into `innerHTML` (`board.js`, `dashboard.js`, `workflow.js`,
  `app.js`, and `lanes.js`) rather than shared. New render code that interpolates
  user data into `innerHTML` should follow the same escape-before-render pattern
  (see the canonical implementation in
  [`public/js/components/lanes.js`](public/js/components/lanes.js:9)).
- **All IDs are client-side `uid()`.** With no server, the historical
  server-side-import-ID exception is dead: `store.importBoard` generates and
  validates IDs client-side with the same `uid()` algorithm the rest of the
  app uses. It still **always creates a new board** and never
  merges/overwrites — the imported bundle carries no db ids; workflow/lane
  references are by array index, resolved to fresh ids at write time.
- **`public/js/components/attachments.js` imports `store.js` directly — this
  is the one intentional exception to the "components only reach persistence
  through `ctx`" rule documented at the top of `app.js`.** The attachment
  widget is fully self-contained (it needs no `ctx` and is mounted into a bare
  container element), so it talks to `store.js` straight. Do **not** "fix" it
  by routing it through `ctx` — that would add plumbing for no benefit and
  break the self-contained design. Attachment binaries live in a dedicated
  `attachmentBlobs` Dexie table behind three helpers in `store.js`
  (`saveAttachmentBlob`/`readAttachmentBlob`/`deleteAttachmentBlob`) so a
  future swap to the Capacitor Filesystem plugin touches only those three.

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes_tool` or `query_graph_tool` instead of Grep
- **Understanding impact**: `get_impact_radius_tool` instead of manually tracing imports
- **Code review**: `detect_changes_tool` + `get_review_context_tool` instead of reading entire files
- **Finding relationships**: `query_graph_tool` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview_tool` + `list_communities_tool`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
| ------ | ---------- |
| `detect_changes_tool` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context_tool` | Need source snippets for review — token-efficient |
| `get_impact_radius_tool` | Understanding blast radius of a change |
| `get_affected_flows_tool` | Finding which execution paths are impacted |
| `query_graph_tool` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes_tool` | Finding functions/classes by name or keyword |
| `get_architecture_overview_tool` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes_tool` for code review.
3. Use `get_affected_flows_tool` to understand impact.
4. Use `query_graph_tool` pattern="tests_for" to check coverage.
