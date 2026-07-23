// db.js — Dexie (IndexedDB) instance + schema for repo-ops-tracker.
// Native ES module, no build step. Vendored Dexie (see vendor/dexie.mjs).
//
// This replaces the Express/Prisma/SQLite server as the persistence layer for
// the Android/Capacitor port. One Dexie table per Prisma model (same field
// names); foreign keys are plain indexed fields — referential integrity and
// cascade deletes are enforced in store.js, not by IndexedDB.
//
// Schema is derived from prisma/schema.prisma (see RECON.md §a). Indexes cover
// only the fields the current routes filter/sort by — no speculative indexes.

import Dexie from './vendor/dexie.mjs';

export const db = new Dexie('repo-ops-tracker');

db.version(1).stores({
  // Board.id PK; isDefault indexed for the default-board lookup / seed check.
  boards: 'id, isDefault',
  // WorkflowState: filtered by boardId, ordered by sortOrder.
  workflows: 'id, boardId, sortOrder',
  // Lane: filtered by boardId, ordered by sortOrder.
  lanes: 'id, boardId, sortOrder',
  // Task: filtered by boardId; laneId/column used by delete-reassign paths.
  // `tags` is stored as a native array (structured clone) — NOT a JSON string.
  tasks: 'id, boardId, laneId, column',
  // LibraryEntry: global (not board-scoped). type kept for possible filtering.
  library: 'id, type',
  // Attachment metadata. Owner is exactly one of taskId / libraryEntryId.
  attachments: 'id, taskId, libraryEntryId',
  // Attachment binaries, kept in a separate store so metadata reads stay light.
  // id === Attachment.id. Access only via store.js blob helpers.
  attachmentBlobs: 'id',
  // LibraryEntryTask join. Prisma uses a composite PK ([entryId, taskId]); here
  // a surrogate auto-increment key + a compound uniqueness index model the same
  // unordered-pair link (see RECON.md §a).
  libraryTasks: '++_pk, entryId, taskId, [entryId+taskId]'
});
