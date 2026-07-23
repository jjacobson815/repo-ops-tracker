// store.js — client-side data-access layer over Dexie/IndexedDB.
// One async function per former Express operation, returning the SAME shape the
// client already consumes (see RECON.md §b). This is what app.js and
// attachments.js call in place of the deleted fetch layer (api.js).
//
// Discipline (carried over from lib/db.js / KI-01):
//   * Every multi-table write runs inside db.transaction('rw', ...).
//   * Bulk / join-table saves use UPSERT + scoped DELETE-DIFF (compute the
//     add/update/remove delta and apply only that) — never clear-all-reinsert.
//   * Cascade deletes replicate the schema's onDelete: Cascade, always scoped
//     by parent id, never unscoped.
//   * Import validation mirrors the old server exactly (same rejection cases,
//     same error messages); validation runs BEFORE the write transaction so a
//     malformed bundle leaves the DB untouched (transaction never opens).

import { db } from './db.js';

// ---------- id / time helpers (identical algorithm to the old server) --------
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function nowIso() {
  return new Date().toISOString();
}

// ---------- attachment binary helpers ---------------------------------------
// The only place that touches attachment binaries. A later swap to the
// Capacitor Filesystem plugin should need to change ONLY these three.
const MAX_ATTACHMENT_MB = 25;
const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024;

async function saveAttachmentBlob(id, blob) {
  await db.attachmentBlobs.put({ id, blob });
}
async function readAttachmentBlob(id) {
  const row = await db.attachmentBlobs.get(id);
  return row ? row.blob : null;
}
async function deleteAttachmentBlob(id) {
  await db.attachmentBlobs.delete(id);
}

// ---------- validation (ported verbatim from server.js) ----------------------
function validHexColor(v) {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}
function validBoard(board) {
  return board && typeof board === 'object'
    && typeof board.id === 'string' && /^[a-z0-9-]+$/.test(board.id)
    && typeof board.title === 'string' && board.title.trim().length > 0
    && typeof board.description === 'string'
    && typeof board.createdAt === 'string'
    && typeof board.updatedAt === 'string'
    && typeof board.isDefault === 'boolean';
}
export function validBoards(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  const ids = new Set();
  return arr.every(board => {
    if (!validBoard(board) || ids.has(board.id)) return false;
    ids.add(board.id);
    return true;
  });
}
function validWorkflow(workflow) {
  if (!Array.isArray(workflow) || workflow.length === 0) return false;
  const ids = new Set();
  return workflow.every(state => {
    if (!state || typeof state !== 'object') return false;
    if (typeof state.id !== 'string' || !/^[a-z0-9-]+$/.test(state.id) || ids.has(state.id)) return false;
    ids.add(state.id);
    return typeof state.label === 'string' && state.label.trim().length > 0 && state.label.trim().length <= 40
      && typeof state.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(state.accent)
      && typeof state.isComplete === 'boolean'
      && typeof state.boardId === 'string' && /^[a-z0-9-]+$/.test(state.boardId)
      && typeof state.sortOrder === 'number';
  });
}
function validLane(lane) {
  if (!lane || typeof lane !== 'object') return false;
  if (typeof lane.id !== 'string' || !/^[a-z0-9-]+$/.test(lane.id)) return false;
  if (typeof lane.label !== 'string' || lane.label.trim().length === 0 || lane.label.trim().length > 40) return false;
  if (typeof lane.accent !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(lane.accent)) return false;
  if (typeof lane.boardId !== 'string' || !/^[a-z0-9-]+$/.test(lane.boardId)) return false;
  if (typeof lane.sortOrder !== 'number') return false;
  return true;
}
export function validLanes(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  const ids = new Set();
  return arr.every(lane => {
    if (!validLane(lane)) return false;
    if (ids.has(lane.id)) return false;
    ids.add(lane.id);
    return true;
  });
}
function validImportWorkflow(arr) {
  return Array.isArray(arr) && arr.length > 0 && arr.every((s) =>
    s && typeof s === 'object'
    && typeof s.label === 'string' && s.label.trim().length > 0 && s.label.trim().length <= 40
    && validHexColor(s.accent)
    && typeof s.isComplete === 'boolean');
}
function validImportLanes(arr) {
  return Array.isArray(arr) && arr.length > 0 && arr.every((l) =>
    l && typeof l === 'object'
    && typeof l.label === 'string' && l.label.trim().length > 0 && l.label.trim().length <= 40
    && validHexColor(l.accent));
}
function validImportLibrary(arr) {
  return arr === undefined || (Array.isArray(arr) && arr.every((e) =>
    e && typeof e === 'object'
    && typeof e.title === 'string' && e.title.trim().length > 0
    && typeof e.category === 'string'
    && typeof e.body === 'string'
    && (e.type === undefined || typeof e.type === 'string')
    && (e.lang === undefined || e.lang === null || typeof e.lang === 'string')));
}
function validImportTasks(arr, workflowLen, lanesLen, libraryLen) {
  return Array.isArray(arr) && arr.every((t) =>
    t && typeof t === 'object'
    && typeof t.title === 'string' && t.title.trim().length > 0
    && Number.isInteger(t.columnIndex) && t.columnIndex >= 0 && t.columnIndex < workflowLen
    && Number.isInteger(t.laneIndex) && t.laneIndex >= 0 && t.laneIndex < lanesLen
    && (t.tags === undefined || (Array.isArray(t.tags) && t.tags.every((x) => typeof x === 'string')))
    && (t.libraryIndexes === undefined || (Array.isArray(t.libraryIndexes)
        && t.libraryIndexes.every((n) => Number.isInteger(n) && n >= 0 && n < libraryLen)))
    && (t.linkedInstructions === undefined || (Array.isArray(t.linkedInstructions)
        && t.linkedInstructions.every((e) => e && typeof e.title === 'string' && e.title.trim().length > 0
          && typeof e.category === 'string' && typeof e.body === 'string'
          && (e.type === undefined || typeof e.type === 'string')
          && (e.lang === undefined || e.lang === null || typeof e.lang === 'string')))));
}

// A small typed error so callers can surface the same messages the API used.
class StoreError extends Error {}
function fail(message) { throw new StoreError(message); }

// ---------- row normalizers --------------------------------------------------
function normalizeTaskRow(t, boardId) {
  return {
    id: t.id,
    title: t.title || '',
    repoName: t.repoName || '',
    repoUrl: t.repoUrl || '',
    agent: t.agent || '',
    agentCustom: t.agentCustom || '',
    column: t.column || '',
    laneId: t.laneId || 'general',
    boardId: t.boardId || boardId || 'default',
    tags: Array.isArray(t.tags) ? t.tags : [],   // native array, not a JSON string
    notes: t.notes || '',
    createdAt: t.createdAt,
    updatedAt: t.updatedAt
  };
}
function normalizeLibraryRow(e) {
  return {
    id: e.id,
    type: e.type || 'instruction',
    lang: e.lang || null,
    title: e.title || '',
    category: e.category || '',
    body: e.body || '',
    createdAt: e.createdAt,
    updatedAt: e.updatedAt
  };
}

// ---------- cascade helpers (run INSIDE an open rw transaction) --------------
async function cascadeDeleteTasks(taskIds) {
  if (!taskIds.length) return;
  const atts = await db.attachments.where('taskId').anyOf(taskIds).toArray();
  for (const a of atts) { await deleteAttachmentBlob(a.id); }
  if (atts.length) await db.attachments.where('taskId').anyOf(taskIds).delete();
  await db.libraryTasks.where('taskId').anyOf(taskIds).delete();
  await db.tasks.where('id').anyOf(taskIds).delete();
}
async function cascadeDeleteLibraryEntries(entryIds) {
  if (!entryIds.length) return;
  const atts = await db.attachments.where('libraryEntryId').anyOf(entryIds).toArray();
  for (const a of atts) { await deleteAttachmentBlob(a.id); }
  if (atts.length) await db.attachments.where('libraryEntryId').anyOf(entryIds).delete();
  await db.libraryTasks.where('entryId').anyOf(entryIds).delete();
  await db.library.where('id').anyOf(entryIds).delete();
}
async function cascadeDeleteBoard(boardId) {
  const tasks = await db.tasks.where('boardId').equals(boardId).toArray();
  await cascadeDeleteTasks(tasks.map((t) => t.id));
  await db.workflows.where('boardId').equals(boardId).delete();
  await db.lanes.where('boardId').equals(boardId).delete();
  await db.boards.delete(boardId);
}

// The full set of tables any board-mutating transaction may touch.
const BOARD_TABLES = ['boards', 'workflows', 'lanes', 'tasks', 'attachments', 'attachmentBlobs', 'libraryTasks'];

// ============================================================================
// SEED (replaces server.js ensureSeeded / boot seeding)
// ============================================================================
function defaultBoards() {
  const ts = nowIso();
  return [{ id: 'default', title: 'Default board', description: 'The default board', createdAt: ts, updatedAt: ts, isDefault: true }];
}
function defaultWorkflow() {
  return [
    { id: 'backlog', label: 'backlog', accent: '#8891A5', isComplete: false, boardId: 'default', sortOrder: 0 },
    { id: 'cloning', label: 'cloning', accent: '#4FD1C5', isComplete: false, boardId: 'default', sortOrder: 1 },
    { id: 'agent-docs', label: 'agent-docs', accent: '#F5A623', isComplete: false, boardId: 'default', sortOrder: 2 },
    { id: 'build-touch', label: 'build-touch', accent: '#9B8FE0', isComplete: false, boardId: 'default', sortOrder: 3 },
    { id: 'done', label: 'done', accent: '#4ADE80', isComplete: true, boardId: 'default', sortOrder: 4 }
  ];
}
function defaultLanes() {
  return [{ id: 'general', boardId: 'default', label: 'general', accent: '#4FD1C5', sortOrder: 0 }];
}
function seedLibrary() {
  const ts = nowIso();
  return [
    { id: uid(), type: 'instruction', lang: null, category: 'Docs Generation', title: 'New Repo — Dev Docs Bootstrap',
      body: 'You just cloned this repo fresh. Before touching any code:\n1. Map the directory structure and identify the entry point(s).\n2. Identify the package manager, build tool, and test runner in use.\n3. List install/build/test/run commands verbatim as found in config files.\n4. Summarize the architecture in plain terms (layers, major modules, data flow).\n5. Flag anything unusual: custom build steps, monorepo quirks, required env vars.\nOutput as a single ARCHITECTURE.md with those sections.',
      createdAt: ts, updatedAt: ts },
    { id: uid(), type: 'instruction', lang: null, category: 'Orientation', title: 'Codebase Orientation — Quick Feel',
      body: 'Give me a fast orientation pass on this codebase:\n- What does this project do, in 2-3 sentences?\n- What are the 5 most important files/modules and why?\n- How is state/data managed?\n- What would a new contributor need to know before their first PR?\nKeep it skimmable, no fluff.',
      createdAt: ts, updatedAt: ts },
    { id: uid(), type: 'instruction', lang: null, category: 'Build / Test', title: 'Pre-Build Sanity Check',
      body: 'Before making any changes, verify the project actually builds and tests pass on a clean checkout:\n1. Run the install step and report any failures verbatim.\n2. Run the build step and report status.\n3. Run the test suite and report pass/fail counts.\n4. If anything fails, do not attempt fixes yet — just report the exact error output.',
      createdAt: ts, updatedAt: ts }
  ];
}

export async function ensureSeeded() {
  const count = await db.boards.count();
  if (count > 0) return;
  await db.transaction('rw', db.boards, db.workflows, db.lanes, db.library, async () => {
    await db.boards.bulkPut(defaultBoards());
    await db.workflows.bulkPut(defaultWorkflow());
    await db.lanes.bulkPut(defaultLanes());
    await db.library.bulkPut(seedLibrary());
  });
}

// ============================================================================
// TASKS
// ============================================================================
export async function getAllTasks() {
  return db.tasks.toArray();
}
export async function getTasksByBoard(boardId) {
  return db.tasks.where('boardId').equals(boardId).toArray();
}
export async function saveTasksForBoard(boardId, tasks) {
  const rows = (tasks || []).map((t) => normalizeTaskRow(t, boardId));
  await db.transaction('rw', BOARD_TABLES, async () => {
    const incomingIds = new Set(rows.map((r) => r.id));
    const existing = await db.tasks.where('boardId').equals(boardId).toArray();
    const toDelete = existing.map((e) => e.id).filter((id) => !incomingIds.has(id));
    await cascadeDeleteTasks(toDelete);
    if (rows.length) await db.tasks.bulkPut(rows);
  });
}
export async function saveAllTasks(tasks) {
  const rows = (tasks || []).map((t) => normalizeTaskRow(t, 'default'));
  await db.transaction('rw', BOARD_TABLES, async () => {
    const incomingIds = new Set(rows.map((r) => r.id));
    const existing = await db.tasks.toArray();
    const toDelete = existing.map((e) => e.id).filter((id) => !incomingIds.has(id));
    await cascadeDeleteTasks(toDelete);
    if (rows.length) await db.tasks.bulkPut(rows);
  });
}

// ============================================================================
// LIBRARY
// ============================================================================
async function attachTaskIds(entries) {
  const links = await db.libraryTasks.toArray();
  const byEntry = new Map();
  for (const l of links) {
    if (!byEntry.has(l.entryId)) byEntry.set(l.entryId, []);
    byEntry.get(l.entryId).push(l.taskId);
  }
  return entries.map((e) => ({ ...e, taskIds: byEntry.get(e.id) || [] }));
}
export async function getAllLibraryEntries() {
  const entries = await db.library.toArray();
  return attachTaskIds(entries);
}
export async function getLibraryEntriesForTask(taskId) {
  const links = await db.libraryTasks.where('taskId').equals(taskId).toArray();
  const entryIds = [...new Set(links.map((l) => l.entryId))];
  const entries = await db.library.where('id').anyOf(entryIds).toArray();
  return attachTaskIds(entries);
}
export async function saveAllLibraryEntries(entries) {
  const rows = (entries || []).map(normalizeLibraryRow);
  await db.transaction('rw', db.library, db.libraryTasks, db.attachments, db.attachmentBlobs, async () => {
    const incomingIds = new Set(rows.map((r) => r.id));
    const existing = await db.library.toArray();
    const toDelete = existing.map((e) => e.id).filter((id) => !incomingIds.has(id));
    await cascadeDeleteLibraryEntries(toDelete);
    if (rows.length) await db.library.bulkPut(rows);

    // Per-entry link sync: upsert + delete-diff (mirrors the KI-01 fix — never
    // deleteMany+createMany the whole join table).
    for (const e of (entries || [])) {
      const wantTaskIds = Array.isArray(e.taskIds) ? e.taskIds : [];
      const existingLinks = await db.libraryTasks.where('entryId').equals(e.id).toArray();
      const existingTaskIds = new Set(existingLinks.map((l) => l.taskId));
      const wantSet = new Set(wantTaskIds);
      const removeKeys = existingLinks.filter((l) => !wantSet.has(l.taskId)).map((l) => l._pk);
      if (removeKeys.length) await db.libraryTasks.bulkDelete(removeKeys);
      for (const taskId of wantTaskIds) {
        if (!existingTaskIds.has(taskId)) {
          await db.libraryTasks.add({ entryId: e.id, taskId });
        }
      }
    }
  });
}

// ============================================================================
// WORKFLOW
// ============================================================================
export async function getAllWorkflows() {
  return db.workflows.toArray();
}
export async function getWorkflowByBoard(boardId) {
  return db.workflows.where('boardId').equals(boardId).sortBy('sortOrder');
}
export async function saveWorkflowForBoard(boardId, states) {
  await db.transaction('rw', db.workflows, async () => {
    const incomingIds = new Set((states || []).map((s) => s.id));
    const existing = await db.workflows.where('boardId').equals(boardId).toArray();
    const toDelete = existing.map((s) => s.id).filter((id) => !incomingIds.has(id));
    if (toDelete.length) await db.workflows.bulkDelete(toDelete);
    if ((states || []).length) await db.workflows.bulkPut(states);
  });
}
export async function saveAllWorkflows(states) {
  if (!validWorkflow(states)) fail('Workflow must contain one or more valid, uniquely identified states');
  await db.transaction('rw', db.workflows, async () => {
    const incomingIds = new Set((states || []).map((s) => s.id));
    const existing = await db.workflows.toArray();
    const toDelete = existing.map((s) => s.id).filter((id) => !incomingIds.has(id));
    if (toDelete.length) await db.workflows.bulkDelete(toDelete);
    if ((states || []).length) await db.workflows.bulkPut(states);
  });
}
export async function deleteBoardWorkflowState(boardId, stateId, replacementStateId) {
  return db.transaction('rw', db.workflows, db.tasks, async () => {
    const workflow = await db.workflows.where('boardId').equals(boardId).sortBy('sortOrder');
    const stateExists = workflow.some((s) => s.id === stateId);
    const nextWorkflow = workflow.filter((s) => s.id !== stateId);
    if (!stateExists || nextWorkflow.length === 0) fail('Cannot delete this workflow state');

    const tasks = await db.tasks.where('boardId').equals(boardId).toArray();
    const affected = tasks.filter((t) => t.column === stateId);
    if (affected.length > 0 && !nextWorkflow.some((s) => s.id === replacementStateId)) {
      fail('A valid replacement state is required');
    }
    if (affected.length > 0) {
      for (const t of affected) {
        await db.tasks.update(t.id, { column: replacementStateId, updatedAt: nowIso() });
      }
    }
    await db.workflows.delete(stateId);
    return { reassigned: affected.length, workflow: nextWorkflow };
  });
}
export async function deleteWorkflowStateGlobal(stateId, replacementStateId) {
  return db.transaction('rw', db.workflows, db.tasks, async () => {
    const workflow = await db.workflows.toArray();
    const stateExists = workflow.some((s) => s.id === stateId);
    const nextWorkflow = workflow.filter((s) => s.id !== stateId);
    if (!stateExists || nextWorkflow.length === 0) fail('Cannot delete this workflow state');
    const tasks = await db.tasks.toArray();
    const affected = tasks.filter((t) => t.column === stateId);
    if (affected.length > 0 && !nextWorkflow.some((s) => s.id === replacementStateId)) {
      fail('A valid replacement state is required');
    }
    if (affected.length > 0) {
      for (const t of affected) {
        await db.tasks.update(t.id, { column: replacementStateId, updatedAt: nowIso() });
      }
    }
    await db.workflows.delete(stateId);
    return { reassigned: affected.length, workflow: nextWorkflow };
  });
}

// ============================================================================
// LANES
// ============================================================================
export async function getAllLanes() {
  return db.lanes.toArray();
}
export async function getLanesByBoard(boardId) {
  return db.lanes.where('boardId').equals(boardId).sortBy('sortOrder');
}
export async function saveLanesForBoard(boardId, lanes) {
  await db.transaction('rw', db.lanes, async () => {
    const incomingIds = new Set((lanes || []).map((l) => l.id));
    const existing = await db.lanes.where('boardId').equals(boardId).toArray();
    const toDelete = existing.map((l) => l.id).filter((id) => !incomingIds.has(id));
    if (toDelete.length) await db.lanes.bulkDelete(toDelete);
    if ((lanes || []).length) await db.lanes.bulkPut(lanes);
  });
}
export async function saveAllLanes(lanes) {
  if (!validLanes(lanes)) fail('Lanes must contain one or more valid, uniquely identified entries');
  await db.transaction('rw', db.lanes, async () => {
    const incomingIds = new Set((lanes || []).map((l) => l.id));
    const existing = await db.lanes.toArray();
    const toDelete = existing.map((l) => l.id).filter((id) => !incomingIds.has(id));
    if (toDelete.length) await db.lanes.bulkDelete(toDelete);
    if ((lanes || []).length) await db.lanes.bulkPut(lanes);
  });
}
export async function deleteBoardLane(boardId, laneId, replacementLaneId) {
  return db.transaction('rw', db.lanes, db.tasks, async () => {
    const boardLanes = await db.lanes.where('boardId').equals(boardId).sortBy('sortOrder');
    const remaining = boardLanes.filter((l) => l.id !== laneId);
    if (remaining.length === boardLanes.length) fail('Lane not found');
    if (remaining.length === 0) fail('Cannot delete last lane');
    const tasks = await db.tasks.where('boardId').equals(boardId).toArray();
    const affected = tasks.filter((t) => t.laneId === laneId);
    if (affected.length > 0 && !remaining.some((l) => l.id === replacementLaneId)) {
      fail('A valid replacement lane is required');
    }
    if (affected.length > 0) {
      for (const t of affected) {
        await db.tasks.update(t.id, { laneId: replacementLaneId, updatedAt: nowIso() });
      }
    }
    await db.lanes.delete(laneId);
    return { lanes: remaining };
  });
}
export async function deleteLaneGlobal(laneId, replacementLaneId) {
  return db.transaction('rw', db.lanes, db.tasks, async () => {
    const lanes = await db.lanes.toArray();
    const laneExists = lanes.some((l) => l.id === laneId);
    const nextLanes = lanes.filter((l) => l.id !== laneId);
    if (!laneExists || nextLanes.length === 0) fail('Cannot delete the last remaining lane');
    const tasks = await db.tasks.toArray();
    const affected = tasks.filter((t) => t.laneId === laneId);
    if (affected.length > 0 && !nextLanes.some((l) => l.id === replacementLaneId)) {
      fail('A valid replacement lane is required when the lane contains cards');
    }
    if (affected.length > 0) {
      for (const t of affected) {
        await db.tasks.update(t.id, { laneId: replacementLaneId, updatedAt: nowIso() });
      }
    }
    await db.lanes.delete(laneId);
    return { lanes: nextLanes };
  });
}

// ============================================================================
// BOARDS
// ============================================================================
export async function getAllBoards() {
  return db.boards.toArray();
}
export async function getBoardById(id) {
  return (await db.boards.get(id)) || null;
}
export async function saveAllBoards(boards) {
  if (!validBoards(boards)) fail('Boards must contain one or more valid, uniquely identified entries');
  await db.transaction('rw', BOARD_TABLES, async () => {
    const incomingIds = new Set((boards || []).map((b) => b.id));
    const existing = await db.boards.toArray();
    const toDelete = existing.map((b) => b.id).filter((id) => !incomingIds.has(id));
    // KI-01: cascade-delete ONLY boards absent from the payload. When adding a
    // board the payload includes all existing boards, so toDelete is empty and
    // no children are touched.
    for (const bid of toDelete) { await cascadeDeleteBoard(bid); }
    if ((boards || []).length) await db.boards.bulkPut(boards);
  });
}
export async function updateBoard(boardId, patch) {
  const existing = await db.boards.get(boardId);
  if (!existing) fail('Board not found');
  const updated = { ...existing, ...patch, id: boardId, updatedAt: nowIso() };
  if (!validBoard(updated)) fail('Invalid board update');
  await db.boards.put(updated);
  return updated;
}
export async function deleteBoard(boardId) {
  const existing = await db.boards.get(boardId);
  if (!existing) fail('Board not found');
  const boards = await db.boards.toArray();
  const remaining = boards.filter((b) => b.id !== boardId);
  if (remaining.length === 0) fail('Cannot delete the last remaining board');
  await db.transaction('rw', BOARD_TABLES, async () => {
    await cascadeDeleteBoard(boardId);
  });
  return remaining;
}

// ============================================================================
// IMPORT (ports POST /api/boards/import — same validation, messages, and
// index-resolution + library-dedup semantics; IDs generated client-side).
// ============================================================================
export async function importBoard(bundle) {
  const body = bundle || {};
  const boardIn = body.board;
  const workflowIn = body.workflow;
  const lanesIn = body.lanes;
  const tasksIn = Array.isArray(body.tasks) ? body.tasks : [];
  const libraryIn = Array.isArray(body.library) ? body.library : [];

  // --- validate BEFORE any write, so a bad bundle leaves the DB untouched ---
  if (!boardIn || typeof boardIn.title !== 'string'
      || boardIn.title.trim().length === 0 || boardIn.title.trim().length > 200) {
    fail('board.title is required (1-200 chars)');
  }
  if (!validImportWorkflow(workflowIn)) fail('workflow must be a non-empty array of {label, accent, isComplete}');
  if (!validImportLanes(lanesIn)) fail('lanes must be a non-empty array of {label, accent}');
  if (!validImportLibrary(libraryIn)) fail('library entries are invalid');
  if (!validImportTasks(tasksIn, workflowIn.length, lanesIn.length, libraryIn.length)) {
    fail('a task is invalid or has an out-of-range columnIndex/laneIndex/libraryIndexes entry');
  }

  const boardId = uid();
  const timestamp = nowIso();

  const board = {
    id: boardId,
    title: boardIn.title.trim(),
    description: typeof boardIn.description === 'string' ? boardIn.description : '',
    createdAt: timestamp,
    updatedAt: timestamp,
    isDefault: false
  };
  const workflow = workflowIn.map((s, i) => ({
    id: uid(), label: s.label.trim(), accent: s.accent, isComplete: s.isComplete, boardId, sortOrder: i
  }));
  const lanes = lanesIn.map((l, i) => ({ id: uid(), boardId, label: l.label.trim(), accent: l.accent, sortOrder: i }));
  const tasks = tasksIn.map((t) => ({
    id: uid(),
    title: t.title.trim(),
    repoName: typeof t.repoName === 'string' ? t.repoName : '',
    repoUrl: typeof t.repoUrl === 'string' ? t.repoUrl : '',
    agent: typeof t.agent === 'string' ? t.agent : '',
    agentCustom: typeof t.agentCustom === 'string' ? t.agentCustom : '',
    column: workflow[t.columnIndex].id,
    laneId: lanes[t.laneIndex].id,
    boardId,
    tags: Array.isArray(t.tags) ? t.tags : [],
    notes: typeof t.notes === 'string' ? t.notes : '',
    createdAt: typeof t.createdAt === 'string' ? t.createdAt : timestamp,
    updatedAt: typeof t.updatedAt === 'string' ? t.updatedAt : timestamp
  }));

  if (!validBoard(board) || !validWorkflow(workflow) || !validLanes(lanes)) {
    fail('internal board construction error');
  }

  // Merge each task's linked instructions (inline objects via linkedInstructions
  // or by index via libraryIndexes) into one deduplicated library set; resolve
  // each task's links to indices into that set (mirrors the old server).
  const libraryEntries = libraryIn.map((e) => ({
    title: e.title.trim(),
    category: typeof e.category === 'string' ? e.category : '',
    body: typeof e.body === 'string' ? e.body : '',
    type: typeof e.type === 'string' ? e.type : 'instruction',
    lang: typeof e.lang === 'string' ? e.lang : null
  }));
  const libKey = (e) => `${e.type || 'instruction'}|${e.lang || ''}|${e.title}|${e.category}|${e.body}`;
  const combinedLibrary = libraryEntries.slice();
  const libIndexByKey = new Map(combinedLibrary.map((e, i) => [libKey(e), i]));
  function resolveLibIndex(e) {
    const key = libKey(e);
    if (libIndexByKey.has(key)) return libIndexByKey.get(key);
    const idx = combinedLibrary.length;
    combinedLibrary.push({
      title: String(e.title || '').trim(),
      category: typeof e.category === 'string' ? e.category : '',
      body: typeof e.body === 'string' ? e.body : '',
      type: typeof e.type === 'string' ? e.type : 'instruction',
      lang: typeof e.lang === 'string' ? e.lang : null
    });
    libIndexByKey.set(key, idx);
    return idx;
  }
  const taskLibraryLinks = tasksIn.map((t) => {
    const links = [];
    if (Array.isArray(t.linkedInstructions) && t.linkedInstructions.length) {
      for (const e of t.linkedInstructions) {
        if (e && typeof e.title === 'string' && e.title.trim().length > 0) links.push(resolveLibIndex(e));
      }
    } else if (Array.isArray(t.libraryIndexes)) {
      for (const i of t.libraryIndexes) {
        if (Number.isInteger(i) && i >= 0 && i < libraryIn.length) links.push(i);
      }
    }
    return links;
  });

  // --- single transaction (ports lib/db.js createBoardBundle) ---------------
  await db.transaction('rw', db.boards, db.workflows, db.lanes, db.tasks, db.library, db.libraryTasks, async () => {
    await db.boards.add(board);
    if (workflow.length) await db.workflows.bulkAdd(workflow);
    if (lanes.length) await db.lanes.bulkAdd(lanes);
    if (tasks.length) await db.tasks.bulkAdd(tasks);

    // Dedup each library entry against the EXISTING global library (all fields
    // equal → reuse), else create with a fresh uid. `title` isn't an indexed
    // field (not queried anywhere else), so this is a full-table scan+filter —
    // matches the old server's prisma.findFirst({ where: entry }) semantics
    // without adding a speculative index.
    const existingLibrary = await db.library.toArray();
    const resolvedLibraryIds = [];
    for (const entry of combinedLibrary) {
      const existing = existingLibrary.find((row) => row.title === entry.title && row.category === entry.category
        && row.body === entry.body && (row.type || 'instruction') === entry.type && (row.lang || null) === entry.lang);
      if (existing) {
        resolvedLibraryIds.push(existing.id);
      } else {
        const id = uid();
        const row = { id, createdAt: board.createdAt, updatedAt: board.createdAt, ...entry };
        await db.library.add(row);
        existingLibrary.push(row); // so a later duplicate in this same bundle reuses it too
        resolvedLibraryIds.push(id);
      }
    }

    const linkRows = [];
    tasks.forEach((task, i) => {
      (taskLibraryLinks[i] || []).forEach((libIndex) => {
        linkRows.push({ entryId: resolvedLibraryIds[libIndex], taskId: task.id });
      });
    });
    if (linkRows.length) await db.libraryTasks.bulkAdd(linkRows);
  });

  return { boardId };
}

// ============================================================================
// ATTACHMENTS (self-contained; consumed directly by attachments.js)
// ============================================================================
export async function getAttachmentsForTask(taskId) {
  return db.attachments.where('taskId').equals(taskId).sortBy('createdAt');
}
export async function getAttachmentsForLibraryEntry(libraryEntryId) {
  return db.attachments.where('libraryEntryId').equals(libraryEntryId).sortBy('createdAt');
}
export async function getAttachments(ownerType, ownerId) {
  return ownerType === 'task'
    ? getAttachmentsForTask(ownerId)
    : getAttachmentsForLibraryEntry(ownerId);
}
export async function getAttachmentById(id) {
  return (await db.attachments.get(id)) || null;
}
// Enforces the same 25MB size limit the server (multer) enforced; throws
// 'File too large' so the UI shows the equivalent message.
export async function uploadAttachment(ownerType, ownerId, file) {
  if (!file) fail('file is required');
  if (file.size > MAX_ATTACHMENT_BYTES) fail('File too large');
  const id = uid();
  const meta = {
    id,
    filename: file.name || 'file',
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    storedName: id,               // no disk file — storedName === id on-device
    taskId: ownerType === 'task' ? ownerId : undefined,
    libraryEntryId: ownerType === 'task' ? undefined : ownerId,
    createdAt: nowIso()
  };
  await db.transaction('rw', db.attachments, db.attachmentBlobs, async () => {
    await saveAttachmentBlob(id, file);
    await db.attachments.add(meta);
  });
  return meta;
}
export async function deleteAttachment(id) {
  const attachment = await db.attachments.get(id);
  if (!attachment) return null;
  await db.transaction('rw', db.attachments, db.attachmentBlobs, async () => {
    await db.attachments.delete(id);
    await deleteAttachmentBlob(id);
  });
  return attachment;
}
// Returns a fresh object URL for the attachment binary (caller revokes it).
export async function attachmentObjectUrl(id) {
  const blob = await readAttachmentBlob(id);
  return blob ? URL.createObjectURL(blob) : null;
}
